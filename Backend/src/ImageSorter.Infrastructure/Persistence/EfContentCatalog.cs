using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Infrastructure.Persistence;

public sealed class EfContentCatalog(ContentDbContext db) : IContentCatalog, IPeriodCatalog
{
    public Task<bool> ExistsAsync(Guid id, CancellationToken ct) => db.Contents.AnyAsync(content => content.Id == id, ct);
    public async Task AddAsync(ContentRecord content, CancellationToken ct) { db.Contents.Add(content); await db.SaveChangesAsync(ct); }
    public async Task<IReadOnlyList<ContentRecord>> GetDirtyContentAsync(CancellationToken ct) => await db.Contents.AsNoTracking()
        .Where(content => content.Dirty)
        .OrderBy(content => content.AddedAt)
        .ToListAsync(ct);

    public async Task<IReadOnlyList<ContentRecord>> GetContentAsync(CancellationToken ct) => await db.Contents.AsNoTracking()
        .OrderBy(content => content.Id)
        .ToListAsync(ct);

    public async Task MarkCleanAsync(Guid id, CancellationToken ct) =>
        await db.Contents.Where(content => content.Id == id)
            .ExecuteUpdateAsync(update => update.SetProperty(content => content.Dirty, false), ct);

    public async Task<bool> MergeTagsAndDeleteAsync(Guid sourceId, Guid targetId, CancellationToken ct)
    {
        if (sourceId == targetId) return false;

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var source = await db.Contents.Include(content => content.ContentTags)
            .SingleOrDefaultAsync(content => content.Id == sourceId, ct);
        var target = await db.Contents.Include(content => content.ContentTags)
            .SingleOrDefaultAsync(content => content.Id == targetId, ct);
        if (source is null || target is null)
        {
            await transaction.CommitAsync(ct);
            return false;
        }

        var targetTags = target.ContentTags.Select(link => link.TagName).ToHashSet(StringComparer.Ordinal);
        db.ContentTags.AddRange(source.ContentTags
            .Where(link => targetTags.Add(link.TagName))
            .Select(link => new ContentTag(target.Id, link.TagName)));
        target.MergeDescription(source.Description);
        target.MergeTakenAt(source);
        db.Contents.Remove(source);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    public async Task<IReadOnlyList<ContentRecord>> ListAsync(IReadOnlyList<string> tags, int skip, int take, CancellationToken ct)
    {
        var query = db.Contents.AsNoTracking().Include(content => content.ContentTags).ThenInclude(link => link.Tag).AsQueryable();
        foreach (var tag in tags) query = query.Where(content => content.ContentTags.Any(link => link.TagName == tag));
        return await query.OrderByDescending(content => content.AddedAt).ThenBy(content => content.Id).Skip(skip).Take(take).ToListAsync(ct);
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
            .Where(content => db.PeriodContents.Any(link => link.PeriodId == id && link.ContentId == content.Id))
            .Include(content => content.ContentTags).ThenInclude(link => link.Tag)
            .OrderByDescending(content => content.AddedAt).ThenBy(content => content.Id)
            .ToListAsync(ct);
    }
    public async Task CreatePeriodAsync(Period period, IReadOnlyList<Guid> contentIds, CancellationToken ct)
    {
        var ids = contentIds.Distinct().ToArray();
        if (ids.Length > 0)
        {
        var existing = await db.Contents.CountAsync(content => ids.Contains(content.Id), ct);
            if (existing != ids.Length) throw new KeyNotFoundException("One or more selected contents were not found.");
        }
        db.Periods.Add(period);
        db.PeriodContents.AddRange(ids.Select(contentId => new PeriodContent(period.Id, contentId)));
        await db.SaveChangesAsync(ct);
    }
    public async Task<bool> UpdatePeriodAsync(Guid id, string name, DateOnly startDate, DateOnly endDate, Guid? titleImageId, CancellationToken ct)
    {
        var period = await db.Periods.Include(item => item.Contents).SingleOrDefaultAsync(item => item.Id == id, ct);
        if (period is null) return false;
        if (titleImageId is not null && !period.Contents.Any(link => link.ContentId == titleImageId))
            throw new ArgumentException("The title image must be associated with the period.");
        period.Update(name, startDate, endDate);
        period.SetTitleImage(titleImageId);
        await db.SaveChangesAsync(ct);
        return true;
    }
    public async Task<bool> AddPeriodContentsAsync(Guid id, IReadOnlyList<Guid> contentIds, IReadOnlyList<string> tags, bool allMatching, IReadOnlyList<Guid> excludedIds, CancellationToken ct)
    {
        var period = await db.Periods.Include(item => item.Contents).SingleOrDefaultAsync(item => item.Id == id, ct);
        if (period is null) return false;
        IQueryable<ContentRecord> query = db.Contents.AsQueryable();
        Guid[] selected;
        if (allMatching)
        {
            foreach (var tag in tags) query = query.Where(content => content.ContentTags.Any(link => link.TagName == tag));
            var excluded = excludedIds.Distinct().ToArray();
            if (excluded.Length > 0) query = query.Where(content => !excluded.Contains(content.Id));
            selected = await query.Select(content => content.Id).ToArrayAsync(ct);
        }
        else
        {
            selected = contentIds.Distinct().ToArray();
            var existingCount = await db.Contents.CountAsync(content => selected.Contains(content.Id), ct);
            if (existingCount != selected.Length) throw new KeyNotFoundException("One or more selected contents were not found.");
        }

        var current = period.Contents.Select(link => link.ContentId).ToHashSet();
        var added = selected.Where(contentId => current.Add(contentId)).ToArray();
        db.PeriodContents.AddRange(added.Select(contentId => new PeriodContent(id, contentId)));
        var contentsToDate = await db.Contents.Where(content => added.Contains(content.Id) && content.TakenAt == null).ToListAsync(ct);
        foreach (var content in contentsToDate) content.UpdateTakenAt(period.StartDate);
        await db.SaveChangesAsync(ct);
        return true;
    }
    public async Task<bool> RemovePeriodContentAsync(Guid id, Guid contentId, CancellationToken ct)
    {
        var period = await db.Periods.SingleOrDefaultAsync(item => item.Id == id, ct);
        if (period is null) return false;
        var link = await db.PeriodContents.FindAsync([id, contentId], ct);
        if (link is not null) db.PeriodContents.Remove(link);
        if (period.TitleImageId == contentId) period.SetTitleImage(null);
        await db.SaveChangesAsync(ct);
        return true;
    }
    public async Task<bool> DeletePeriodAsync(Guid id, CancellationToken ct)
    {
        var period = await db.Periods.SingleOrDefaultAsync(item => item.Id == id, ct);
        if (period is null) return false;
        db.Periods.Remove(period);
        await db.SaveChangesAsync(ct);
        return true;
    }
    public async Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct) => await db.Tags.AsNoTracking().Where(tag => !tag.IsAuto).OrderBy(tag => tag.Name).Select(tag => tag.Name).ToListAsync(ct);
    public async Task<IReadOnlyList<string>> GetAutoTagsAsync(CancellationToken ct) => await db.Tags.AsNoTracking().Where(tag => tag.IsAuto).OrderBy(tag => tag.Name).Select(tag => tag.Name).ToListAsync(ct);
    public async Task SetTagAsync(Guid id, string tag, CancellationToken ct)
    {
        if (!await db.Contents.AnyAsync(content => content.Id == id, ct)) throw new KeyNotFoundException($"Content '{id}' was not found.");
        var existingTag = await db.Tags.SingleOrDefaultAsync(item => item.Name == tag, ct);
        if (existingTag?.IsAuto == true) throw new ArgumentException($"The tag '{tag}' is assigned automatically.");
        if (existingTag is null) db.Tags.Add(new Tag(tag));
        if (!await db.ContentTags.AnyAsync(link => link.ContentId == id && link.TagName == tag, ct)) db.ContentTags.Add(new ContentTag(id, tag));
        await db.SaveChangesAsync(ct);
    }
    public async Task RemoveTagAsync(Guid id, string tag, CancellationToken ct)
    {
        if (await db.Tags.AnyAsync(item => item.Name == tag && item.IsAuto, ct))
            throw new ArgumentException($"The tag '{tag}' is assigned automatically.");
        var link = await db.ContentTags.FindAsync([id, tag], ct);
        if (link is null) return;
        db.ContentTags.Remove(link);
        await db.SaveChangesAsync(ct);
        if (!await db.ContentTags.AnyAsync(item => item.TagName == tag, ct))
        {
            var unusedTag = await db.Tags.FindAsync([tag], ct);
            if (unusedTag is not null) { db.Tags.Remove(unusedTag); await db.SaveChangesAsync(ct); }
        }
    }

    public async Task<bool> SetMetadataAsync(Guid id, string? description, DateOnly? takenAt, CancellationToken ct)
    {
        var content = await db.Contents.SingleOrDefaultAsync(item => item.Id == id, ct);
        if (content is null) return false;
        if (description is not null) content.UpdateDescription(description);
        var oldYearTag = content.TakenAt?.Year.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var newYearTag = takenAt?.Year.ToString(System.Globalization.CultureInfo.InvariantCulture);
        content.UpdateTakenAt(takenAt);
        if (oldYearTag != newYearTag || (takenAt is null && oldYearTag is null))
        {
            if (oldYearTag is not null)
            {
                var oldLink = await db.ContentTags.FindAsync([id, oldYearTag], ct);
                if (oldLink is not null) db.ContentTags.Remove(oldLink);
            }
            if (newYearTag is not null)
            {
                var yearTag = await db.Tags.FindAsync([newYearTag], ct);
                if (yearTag is null) db.Tags.Add(new Tag(newYearTag, true));
                else yearTag.MarkAuto();
                if (!await db.ContentTags.AnyAsync(link => link.ContentId == id && link.TagName == newYearTag, ct))
                    db.ContentTags.Add(new ContentTag(id, newYearTag));
            }
            var noDateTag = await db.Tags.FindAsync(["no date"], ct);
            if (takenAt is null)
            {
                if (noDateTag is null) db.Tags.Add(new Tag("no date", true));
                else noDateTag.MarkAuto();
                if (!await db.ContentTags.AnyAsync(link => link.ContentId == id && link.TagName == "no date", ct))
                    db.ContentTags.Add(new ContentTag(id, "no date"));
            }
            else if (noDateTag is not null)
            {
                var noDateLink = await db.ContentTags.FindAsync([id, "no date"], ct);
                if (noDateLink is not null) db.ContentTags.Remove(noDateLink);
            }
        }
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var content = await db.Contents.Include(item => item.ContentTags).ThenInclude(link => link.Tag)
            .SingleOrDefaultAsync(item => item.Id == id, ct);
        if (content is null) return false;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var periodLinks = await db.PeriodContents.Where(link => link.ContentId == id).ToListAsync(ct);
        var titlePeriods = await db.Periods.Where(period => period.TitleImageId == id).ToListAsync(ct);
        var titlePeriodIds = titlePeriods.Select(period => period.Id).ToArray();
        db.DeletedContents.Add(new DeletedContentRecord(content, DateTimeOffset.UtcNow,
            System.Text.Json.JsonSerializer.Serialize(content.ContentTags.Select(link => new DeletedTagSnapshot(link.TagName, link.Tag?.IsAuto ?? false)).ToArray()),
            System.Text.Json.JsonSerializer.Serialize(periodLinks.Select(link => link.PeriodId).ToArray()),
            System.Text.Json.JsonSerializer.Serialize(titlePeriodIds)));
        db.PeriodContents.RemoveRange(periodLinks);
        foreach (var period in titlePeriods) period.SetTitleImage(null);
        db.Contents.Remove(content);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task<bool> RestoreAsync(Guid id, CancellationToken ct)
    {
        var deleted = await db.DeletedContents.SingleOrDefaultAsync(item => item.Id == id, ct);
        if (deleted is null) return false;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var content = new ContentRecord(deleted.Id, deleted.ContentType, deleted.AddedAt, deleted.TakenAt, deleted.Description, deleted.Dirty);
        db.Contents.Add(content);
        foreach (var tagSnapshot in System.Text.Json.JsonSerializer.Deserialize<DeletedTagSnapshot[]>(deleted.TagsJson) ?? [])
        {
            var tag = await db.Tags.SingleOrDefaultAsync(item => item.Name == tagSnapshot.Name, ct);
            if (tag is null) db.Tags.Add(new Tag(tagSnapshot.Name, tagSnapshot.IsAuto));
            else if (tagSnapshot.IsAuto) tag.MarkAuto();
            db.ContentTags.Add(new ContentTag(id, tagSnapshot.Name));
        }
        var periodIds = System.Text.Json.JsonSerializer.Deserialize<Guid[]>(deleted.PeriodLinksJson) ?? [];
        var existingPeriodIds = await db.Periods.Where(period => periodIds.Contains(period.Id)).Select(period => period.Id).ToArrayAsync(ct);
        db.PeriodContents.AddRange(existingPeriodIds.Select(periodId => new PeriodContent(periodId, id)));
        var titlePeriodIds = System.Text.Json.JsonSerializer.Deserialize<Guid[]>(deleted.TitlePeriodIdsJson) ?? [];
        var periods = await db.Periods.Where(period => titlePeriodIds.Contains(period.Id)).ToListAsync(ct);
        foreach (var period in periods) period.SetTitleImage(id);
        db.DeletedContents.Remove(deleted);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task<IReadOnlyList<Guid>> GetExpiredDeletedContentAsync(DateTimeOffset cutoff, CancellationToken ct) =>
        await db.DeletedContents.Where(item => item.DeletedAt <= cutoff).Select(item => item.Id).ToListAsync(ct);

    public async Task PurgeDeletedContentAsync(Guid id, CancellationToken ct)
    {
        await db.DeletedContents.Where(item => item.Id == id).ExecuteDeleteAsync(ct);
    }

    public async Task ApplyImportTagsAsync(IReadOnlyList<Guid> contentIds, IReadOnlyList<string> tags, string newTag, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var previousNewLinks = await db.ContentTags.Where(link => link.TagName == newTag).ToListAsync(ct);
        db.ContentTags.RemoveRange(previousNewLinks);

        var idsToTag = contentIds.Distinct().ToArray();
        var tagNames = tags.Append(newTag).Distinct().ToArray();
        if (idsToTag.Length > 0)
        {
            var existingTags = await db.Tags.Where(tag => tagNames.Contains(tag.Name)).ToListAsync(ct);
            var existingTagSet = existingTags.Select(tag => tag.Name).ToHashSet(StringComparer.Ordinal);
            db.Tags.AddRange(tagNames.Where(tag => !existingTagSet.Contains(tag)).Select(tag => new Tag(tag, tag == newTag)));
            existingTags.Where(tag => tag.Name == newTag).ToList().ForEach(tag => tag.MarkAuto());

            var existingLinks = await db.ContentTags
                .Where(link => idsToTag.Contains(link.ContentId) && tagNames.Contains(link.TagName))
                .Select(link => new { link.ContentId, link.TagName })
                .ToListAsync(ct);
            var existingLinkSet = existingLinks.Select(link => (link.ContentId, link.TagName)).ToHashSet();
            db.ContentTags.AddRange(idsToTag.SelectMany(id => tagNames
                .Where(tag => !existingLinkSet.Contains((id, tag)))
                .Select(tag => new ContentTag(id, tag))));
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
