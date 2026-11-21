using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Infrastructure.Persistence;

public sealed class EfImageCatalog(ImageDbContext db) : IImageCatalog
{
    public Task<bool> ExistsAsync(string hash, CancellationToken ct) => db.Images.AnyAsync(image => image.Hash == hash, ct);
    public async Task AddAsync(ImageRecord image, CancellationToken ct) { db.Images.Add(image); await db.SaveChangesAsync(ct); }
    public async Task<IReadOnlyList<ImageRecord>> GetDirtyImagesAsync(CancellationToken ct) => await db.Images.AsNoTracking()
        .Where(image => image.Dirty)
        .OrderBy(image => image.AddedAt)
        .ToListAsync(ct);

    public async Task<IReadOnlyList<string>> GetImageHashesAsync(CancellationToken ct) => await db.Images.AsNoTracking()
        .OrderBy(image => image.Hash)
        .Select(image => image.Hash)
        .ToListAsync(ct);

    public async Task MarkCleanAsync(string hash, CancellationToken ct) =>
        await db.Images.Where(image => image.Hash == hash)
            .ExecuteUpdateAsync(update => update.SetProperty(image => image.Dirty, false), ct);

    public async Task<bool> MergeTagsAndDeleteAsync(string sourceHash, string targetHash, CancellationToken ct)
    {
        if (sourceHash == targetHash) return false;

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var source = await db.Images.Include(image => image.ImageTags)
            .SingleOrDefaultAsync(image => image.Hash == sourceHash, ct);
        var target = await db.Images.Include(image => image.ImageTags)
            .SingleOrDefaultAsync(image => image.Hash == targetHash, ct);
        if (source is null || target is null)
        {
            await transaction.CommitAsync(ct);
            return false;
        }

        var targetTags = target.ImageTags.Select(link => link.TagName).ToHashSet(StringComparer.Ordinal);
        db.ImageTags.AddRange(source.ImageTags
            .Where(link => targetTags.Add(link.TagName))
            .Select(link => new ImageTag(targetHash, link.TagName)));
        db.Images.Remove(source);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    public async Task<IReadOnlyList<ImageRecord>> ListAsync(string? tag, int skip, int take, CancellationToken ct)
    {
        var query = db.Images.AsNoTracking().Include(image => image.ImageTags).ThenInclude(link => link.Tag).AsQueryable();
        if (tag is not null) query = query.Where(image => image.ImageTags.Any(link => link.TagName == tag));
        return await query.OrderByDescending(image => image.AddedAt).ThenBy(image => image.Hash).Skip(skip).Take(take).ToListAsync(ct);
    }
    public Task<int> CountAsync(string? tag, CancellationToken ct)
    {
        var query = db.Images.AsQueryable();
        if (tag is not null) query = query.Where(image => image.ImageTags.Any(link => link.TagName == tag));
        return query.CountAsync(ct);
    }
    public async Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct) => await db.Tags.AsNoTracking().OrderBy(tag => tag.Name).Select(tag => tag.Name).ToListAsync(ct);
    public async Task SetTagAsync(string hash, string tag, CancellationToken ct)
    {
        if (!await db.Tags.AnyAsync(item => item.Name == tag, ct)) db.Tags.Add(new Tag(tag));
        if (!await db.ImageTags.AnyAsync(link => link.ImageHash == hash && link.TagName == tag, ct)) db.ImageTags.Add(new ImageTag(hash, tag));
        await db.SaveChangesAsync(ct);
    }
    public async Task RemoveTagAsync(string hash, string tag, CancellationToken ct)
    {
        var link = await db.ImageTags.FindAsync([hash, tag], ct);
        if (link is null) return;
        db.ImageTags.Remove(link);
        await db.SaveChangesAsync(ct);
        if (!await db.ImageTags.AnyAsync(item => item.TagName == tag, ct))
        {
            var unusedTag = await db.Tags.FindAsync([tag], ct);
            if (unusedTag is not null) { db.Tags.Remove(unusedTag); await db.SaveChangesAsync(ct); }
        }
    }

    public async Task ApplyImportTagsAsync(IReadOnlyList<string> imageHashes, IReadOnlyList<string> tags, string newTag, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var previousNewLinks = await db.ImageTags.Where(link => link.TagName == newTag).ToListAsync(ct);
        db.ImageTags.RemoveRange(previousNewLinks);

        var hashes = imageHashes.Distinct().ToArray();
        var tagNames = tags.Append(newTag).Distinct().ToArray();
        if (hashes.Length > 0)
        {
            var existingTagNames = await db.Tags.Where(tag => tagNames.Contains(tag.Name)).Select(tag => tag.Name).ToArrayAsync(ct);
            var existingTagSet = existingTagNames.ToHashSet(StringComparer.Ordinal);
            db.Tags.AddRange(tagNames.Where(tag => !existingTagSet.Contains(tag)).Select(tag => new Tag(tag)));

            var existingLinks = await db.ImageTags
                .Where(link => hashes.Contains(link.ImageHash) && tagNames.Contains(link.TagName))
                .Select(link => new { link.ImageHash, link.TagName })
                .ToListAsync(ct);
            var existingLinkSet = existingLinks.Select(link => (link.ImageHash, link.TagName)).ToHashSet();
            db.ImageTags.AddRange(hashes.SelectMany(hash => tagNames
                .Where(tag => !existingLinkSet.Contains((hash, tag)))
                .Select(tag => new ImageTag(hash, tag))));
        }

        await db.SaveChangesAsync(ct);
        if (!await db.ImageTags.AnyAsync(link => link.TagName == newTag, ct))
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
