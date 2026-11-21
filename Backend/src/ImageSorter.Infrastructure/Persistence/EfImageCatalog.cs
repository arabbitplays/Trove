using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Infrastructure.Persistence;

public sealed class EfImageCatalog(ImageDbContext db) : IImageCatalog
{
    public Task<bool> ExistsAsync(string hash, CancellationToken ct) => db.Images.AnyAsync(image => image.Hash == hash, ct);
    public async Task AddAsync(ImageRecord image, CancellationToken ct) { db.Images.Add(image); await db.SaveChangesAsync(ct); }
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
}
