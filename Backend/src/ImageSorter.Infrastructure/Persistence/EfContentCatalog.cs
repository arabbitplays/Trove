using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Infrastructure.Persistence;

public sealed class EfContentCatalog(ContentDbContext db) : IContentCatalog, IPeriodCatalog
{
    public Task<bool> ExistsAsync(string hash, CancellationToken ct) => db.Contents.AnyAsync(content => content.Hash == hash, ct);
    public async Task AddAsync(ContentRecord content, CancellationToken ct) { db.Contents.Add(content); await db.SaveChangesAsync(ct); }
    public async Task<IReadOnlyList<ContentRecord>> GetDirtyContentAsync(CancellationToken ct) => await db.Contents.AsNoTracking()
        .Where(content => content.Dirty)
        .OrderBy(content => content.AddedAt)
        .ToListAsync(ct);

    public async Task<IReadOnlyList<ContentRecord>> GetContentAsync(CancellationToken ct) => await db.Contents.AsNoTracking()
        .OrderBy(content => content.Hash)
        .ToListAsync(ct);

    public async Task MarkCleanAsync(string hash, CancellationToken ct) =>
        await db.Contents.Where(content => content.Hash == hash)
            .ExecuteUpdateAsync(update => update.SetProperty(content => content.Dirty, false), ct);

    public async Task<bool> MergeTagsAndDeleteAsync(string sourceHash, string targetHash, CancellationToken ct)
    {
        if (sourceHash == targetHash) return false;

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var source = await db.Contents.Include(content => content.ContentTags)
            .SingleOrDefaultAsync(content => content.Hash == sourceHash, ct);
        var target = await db.Contents.Include(content => content.ContentTags)
            .SingleOrDefaultAsync(content => content.Hash == targetHash, ct);
        if (source is null || target is null)
        {
            await transaction.CommitAsync(ct);
            return false;
        }

        var targetTags = target.ContentTags.Select(link => link.TagName).ToHashSet(StringComparer.Ordinal);
        db.ContentTags.AddRange(source.ContentTags
            .Where(link => targetTags.Add(link.TagName))
            .Select(link => new ContentTag(targetHash, link.TagName)));
        target.MergeDescription(source.Description);
        db.Contents.Remove(source);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    public async Task<IReadOnlyList<ContentRecord>> ListAsync(IReadOnlyList<string> tags, int skip, int take, CancellationToken ct)
    {
        var query = db.Contents.AsNoTracking().Include(content => content.ContentTags).ThenInclude(link => link.Tag).AsQueryable();
        foreach (var tag in tags) query = query.Where(content => content.ContentTags.Any(link => link.TagName == tag));
        return await query.OrderByDescending(content => content.AddedAt).ThenBy(content => content.Hash).Skip(skip).Take(take).ToListAsync(ct);
    }
    public Task<int> CountAsync(IReadOnlyList<string> tags, CancellationToken ct)
    {
        var query = db.Contents.AsQueryable();
        foreach (var tag in tags) query = query.Where(content => content.ContentTags.Any(link => link.TagName == tag));
        return query.CountAsync(ct);
    }
    public async Task<IReadOnlyList<string>> GetTagsForContentMatchingAsync(IReadOnlyList<string> tags, CancellationToken ct)
    {
        var query = db.Contents.AsNoTracking().AsQueryable();
        foreach (var tag in tags) query = query.Where(content => content.ContentTags.Any(link => link.TagName == tag));
        return await query.SelectMany(content => content.ContentTags).Select(link => link.TagName).Distinct().OrderBy(tag => tag).ToListAsync(ct);
    }
    public async Task<IReadOnlyList<Period>> ListPeriodsAsync(CancellationToken ct) => await db.Periods.AsNoTracking()
        .Include(period => period.Contents)
        .OrderBy(period => period.StartDate).ThenBy(period => period.Name)
        .ToListAsync(ct);
    public Task<Period?> GetPeriodAsync(Guid id, CancellationToken ct) => db.Periods.AsNoTracking()
        .Include(period => period.Contents)
        .SingleOrDefaultAsync(period => period.Id == id, ct);
    public async Task<IReadOnlyList<ContentRecord>?> GetPeriodContentsAsync(Guid id, CancellationToken ct)
    {
        if (!await db.Periods.AnyAsync(period => period.Id == id, ct)) return null;
        return await db.Contents.AsNoTracking()
            .Where(content => db.PeriodContents.Any(link => link.PeriodId == id && link.ContentHash == content.Hash))
            .Include(content => content.ContentTags).ThenInclude(link => link.Tag)
            .OrderByDescending(content => content.AddedAt).ThenBy(content => content.Hash)
            .ToListAsync(ct);
    }
    public async Task CreatePeriodAsync(Period period, IReadOnlyList<string> contentHashes, CancellationToken ct)
    {
        var hashes = contentHashes.Distinct(StringComparer.Ordinal).ToArray();
        if (hashes.Length > 0)
        {
            var existing = await db.Contents.Where(content => hashes.Contains(content.Hash)).Select(content => content.Hash).ToListAsync(ct);
            if (existing.Count != hashes.Length) throw new KeyNotFoundException("One or more selected contents were not found.");
        }
        db.Periods.Add(period);
        db.PeriodContents.AddRange(hashes.Select(hash => new PeriodContent(period.Id, hash)));
        await db.SaveChangesAsync(ct);
    }
    public async Task<bool> UpdatePeriodAsync(Guid id, string name, DateOnly startDate, DateOnly endDate, string? titleImageHash, CancellationToken ct)
    {
        var period = await db.Periods.Include(item => item.Contents).SingleOrDefaultAsync(item => item.Id == id, ct);
        if (period is null) return false;
        if (titleImageHash is not null && !period.Contents.Any(link => link.ContentHash == titleImageHash))
            throw new ArgumentException("The title image must be associated with the period.");
        period.Update(name, startDate, endDate);
        period.SetTitleImage(titleImageHash);
        await db.SaveChangesAsync(ct);
        return true;
    }
    public async Task<bool> AddPeriodContentsAsync(Guid id, IReadOnlyList<string> hashes, IReadOnlyList<string> tags, bool allMatching, IReadOnlyList<string> excludedHashes, CancellationToken ct)
    {
        var period = await db.Periods.Include(item => item.Contents).SingleOrDefaultAsync(item => item.Id == id, ct);
        if (period is null) return false;
        IQueryable<ContentRecord> query = db.Contents.AsQueryable();
        string[] selected;
        if (allMatching)
        {
            foreach (var tag in tags) query = query.Where(content => content.ContentTags.Any(link => link.TagName == tag));
            var excluded = excludedHashes.Distinct(StringComparer.Ordinal).ToArray();
            if (excluded.Length > 0) query = query.Where(content => !excluded.Contains(content.Hash));
            selected = await query.Select(content => content.Hash).ToArrayAsync(ct);
        }
        else
        {
            selected = hashes.Distinct(StringComparer.Ordinal).ToArray();
            var existingCount = await db.Contents.CountAsync(content => selected.Contains(content.Hash), ct);
            if (existingCount != selected.Length) throw new KeyNotFoundException("One or more selected contents were not found.");
        }

        var current = period.Contents.Select(link => link.ContentHash).ToHashSet(StringComparer.Ordinal);
        var added = selected.Where(hash => current.Add(hash)).ToArray();
        db.PeriodContents.AddRange(added.Select(hash => new PeriodContent(id, hash)));
        var contentsToDate = await db.Contents.Where(content => added.Contains(content.Hash) && content.TakenAt == null).ToListAsync(ct);
        foreach (var content in contentsToDate) content.UpdateTakenAt(period.StartDate);
        await db.SaveChangesAsync(ct);
        return true;
    }
    public async Task<bool> RemovePeriodContentAsync(Guid id, string hash, CancellationToken ct)
    {
        var period = await db.Periods.SingleOrDefaultAsync(item => item.Id == id, ct);
        if (period is null) return false;
        var link = await db.PeriodContents.FindAsync([id, hash], ct);
        if (link is not null) db.PeriodContents.Remove(link);
        if (period.TitleImageHash == hash) period.SetTitleImage(null);
        await db.SaveChangesAsync(ct);
        return true;
    }
    public async Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct) => await db.Tags.AsNoTracking().Where(tag => !tag.IsAuto).OrderBy(tag => tag.Name).Select(tag => tag.Name).ToListAsync(ct);
    public async Task<IReadOnlyList<string>> GetAutoTagsAsync(CancellationToken ct) => await db.Tags.AsNoTracking().Where(tag => tag.IsAuto).OrderBy(tag => tag.Name).Select(tag => tag.Name).ToListAsync(ct);
    public async Task SetTagAsync(string hash, string tag, CancellationToken ct)
    {
        var existingTag = await db.Tags.SingleOrDefaultAsync(item => item.Name == tag, ct);
        if (existingTag?.IsAuto == true) throw new ArgumentException($"The tag '{tag}' is assigned automatically.");
        if (existingTag is null) db.Tags.Add(new Tag(tag));
        if (!await db.ContentTags.AnyAsync(link => link.ContentHash == hash && link.TagName == tag, ct)) db.ContentTags.Add(new ContentTag(hash, tag));
        await db.SaveChangesAsync(ct);
    }
    public async Task RemoveTagAsync(string hash, string tag, CancellationToken ct)
    {
        if (await db.Tags.AnyAsync(item => item.Name == tag && item.IsAuto, ct))
            throw new ArgumentException($"The tag '{tag}' is assigned automatically.");
        var link = await db.ContentTags.FindAsync([hash, tag], ct);
        if (link is null) return;
        db.ContentTags.Remove(link);
        await db.SaveChangesAsync(ct);
        if (!await db.ContentTags.AnyAsync(item => item.TagName == tag, ct))
        {
            var unusedTag = await db.Tags.FindAsync([tag], ct);
            if (unusedTag is not null) { db.Tags.Remove(unusedTag); await db.SaveChangesAsync(ct); }
        }
    }

    public async Task<bool> SetMetadataAsync(string hash, string? description, DateOnly? takenAt, CancellationToken ct)
    {
        var content = await db.Contents.SingleOrDefaultAsync(item => item.Hash == hash, ct);
        if (content is null) return false;
        if (description is not null) content.UpdateDescription(description);
        var oldYearTag = content.TakenAt?.Year.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var newYearTag = takenAt?.Year.ToString(System.Globalization.CultureInfo.InvariantCulture);
        content.UpdateTakenAt(takenAt);
        if (oldYearTag != newYearTag || (takenAt is null && oldYearTag is null))
        {
            if (oldYearTag is not null)
            {
                var oldLink = await db.ContentTags.FindAsync([hash, oldYearTag], ct);
                if (oldLink is not null) db.ContentTags.Remove(oldLink);
            }
            if (newYearTag is not null)
            {
                var yearTag = await db.Tags.FindAsync([newYearTag], ct);
                if (yearTag is null) db.Tags.Add(new Tag(newYearTag, true));
                else yearTag.MarkAuto();
                if (!await db.ContentTags.AnyAsync(link => link.ContentHash == hash && link.TagName == newYearTag, ct))
                    db.ContentTags.Add(new ContentTag(hash, newYearTag));
            }
            var noDateTag = await db.Tags.FindAsync(["no date"], ct);
            if (takenAt is null)
            {
                if (noDateTag is null) db.Tags.Add(new Tag("no date", true));
                else noDateTag.MarkAuto();
                if (!await db.ContentTags.AnyAsync(link => link.ContentHash == hash && link.TagName == "no date", ct))
                    db.ContentTags.Add(new ContentTag(hash, "no date"));
            }
            else if (noDateTag is not null)
            {
                var noDateLink = await db.ContentTags.FindAsync([hash, "no date"], ct);
                if (noDateLink is not null) db.ContentTags.Remove(noDateLink);
            }
        }
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task ApplyImportTagsAsync(IReadOnlyList<string> contentHashes, IReadOnlyList<string> tags, string newTag, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var previousNewLinks = await db.ContentTags.Where(link => link.TagName == newTag).ToListAsync(ct);
        db.ContentTags.RemoveRange(previousNewLinks);

        var hashes = contentHashes.Distinct().ToArray();
        var tagNames = tags.Append(newTag).Distinct().ToArray();
        if (hashes.Length > 0)
        {
            var existingTags = await db.Tags.Where(tag => tagNames.Contains(tag.Name)).ToListAsync(ct);
            var existingTagSet = existingTags.Select(tag => tag.Name).ToHashSet(StringComparer.Ordinal);
            db.Tags.AddRange(tagNames.Where(tag => !existingTagSet.Contains(tag)).Select(tag => new Tag(tag, tag == newTag)));
            existingTags.Where(tag => tag.Name == newTag).ToList().ForEach(tag => tag.MarkAuto());

            var existingLinks = await db.ContentTags
                .Where(link => hashes.Contains(link.ContentHash) && tagNames.Contains(link.TagName))
                .Select(link => new { link.ContentHash, link.TagName })
                .ToListAsync(ct);
            var existingLinkSet = existingLinks.Select(link => (link.ContentHash, link.TagName)).ToHashSet();
            db.ContentTags.AddRange(hashes.SelectMany(hash => tagNames
                .Where(tag => !existingLinkSet.Contains((hash, tag)))
                .Select(tag => new ContentTag(hash, tag))));
        }

        await db.SaveChangesAsync(ct);
        if (!await db.ContentTags.AnyAsync(link => link.TagName == newTag, ct))
        {
            var unusedNewTag = await db.Tags.FindAsync([newTag], ct);
            if (unusedNewTag is not null)
            {
                db.Tags.Remove(unusedNewTag);
                await db.SaveChangesAsync(ct);
            }
        }
        await transaction.CommitAsync(ct);
    }
}
