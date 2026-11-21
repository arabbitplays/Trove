using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Infrastructure.Persistence;

public sealed class EfContentCatalog(ContentDbContext db) : IContentCatalog
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
        db.Contents.Remove(source);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    public async Task<IReadOnlyList<ContentRecord>> ListAsync(string? tag, int skip, int take, CancellationToken ct)
    {
        var query = db.Contents.AsNoTracking().Include(content => content.ContentTags).ThenInclude(link => link.Tag).AsQueryable();
        if (tag is not null) query = query.Where(content => content.ContentTags.Any(link => link.TagName == tag));
        return await query.OrderByDescending(content => content.AddedAt).ThenBy(content => content.Hash).Skip(skip).Take(take).ToListAsync(ct);
    }
    public Task<int> CountAsync(string? tag, CancellationToken ct)
    {
        var query = db.Contents.AsQueryable();
        if (tag is not null) query = query.Where(content => content.ContentTags.Any(link => link.TagName == tag));
        return query.CountAsync(ct);
    }
    public async Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct) => await db.Tags.AsNoTracking().OrderBy(tag => tag.Name).Select(tag => tag.Name).ToListAsync(ct);
    public async Task SetTagAsync(string hash, string tag, CancellationToken ct)
    {
        if (!await db.Tags.AnyAsync(item => item.Name == tag, ct)) db.Tags.Add(new Tag(tag));
        if (!await db.ContentTags.AnyAsync(link => link.ContentHash == hash && link.TagName == tag, ct)) db.ContentTags.Add(new ContentTag(hash, tag));
        await db.SaveChangesAsync(ct);
    }
    public async Task RemoveTagAsync(string hash, string tag, CancellationToken ct)
    {
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

    public async Task ApplyImportTagsAsync(IReadOnlyList<string> contentHashes, IReadOnlyList<string> tags, string newTag, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var previousNewLinks = await db.ContentTags.Where(link => link.TagName == newTag).ToListAsync(ct);
        db.ContentTags.RemoveRange(previousNewLinks);

        var hashes = contentHashes.Distinct().ToArray();
        var tagNames = tags.Append(newTag).Distinct().ToArray();
        if (hashes.Length > 0)
        {
            var existingTagNames = await db.Tags.Where(tag => tagNames.Contains(tag.Name)).Select(tag => tag.Name).ToArrayAsync(ct);
            var existingTagSet = existingTagNames.ToHashSet(StringComparer.Ordinal);
            db.Tags.AddRange(tagNames.Where(tag => !existingTagSet.Contains(tag)).Select(tag => new Tag(tag)));

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
