using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Abstractions;

public interface IContentCatalog
{
    Task<bool> ExistsAsync(string hash, CancellationToken cancellationToken);
    Task AddAsync(ContentRecord content, CancellationToken cancellationToken);
    Task<IReadOnlyList<ContentRecord>> GetDirtyContentAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<ContentRecord>> GetContentAsync(CancellationToken cancellationToken);
    Task MarkCleanAsync(string hash, CancellationToken cancellationToken);
    Task<bool> MergeTagsAndDeleteAsync(string sourceHash, string targetHash, CancellationToken cancellationToken);
    Task<IReadOnlyList<ContentRecord>> ListAsync(IReadOnlyList<string> tags, int skip, int take, CancellationToken cancellationToken);
    Task<int> CountAsync(IReadOnlyList<string> tags, CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> GetTagsForContentMatchingAsync(IReadOnlyList<string> tags, CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> GetAutoTagsAsync(CancellationToken cancellationToken);
    Task SetTagAsync(string hash, string tag, CancellationToken cancellationToken);
    Task RemoveTagAsync(string hash, string tag, CancellationToken cancellationToken);
    Task<bool> SetMetadataAsync(string hash, string? description, DateOnly? takenAt, CancellationToken cancellationToken);
    Task ApplyImportTagsAsync(IReadOnlyList<string> contentHashes, IReadOnlyList<string> tags, string newTag, CancellationToken cancellationToken);
}

public interface IContentStorage
{
    string RootPath { get; }
    Task<(string Hash, string Path)> SaveAsync(Stream content, string extension, CancellationToken cancellationToken);
    Task DeleteAsync(string hash, CancellationToken cancellationToken);
    Task<string?> FindPathAsync(string hash, CancellationToken cancellationToken);
    IAsyncEnumerable<(string Hash, string Path)> EnumerateAsync(CancellationToken cancellationToken);
}

public interface IClock { DateTimeOffset UtcNow { get; } }
