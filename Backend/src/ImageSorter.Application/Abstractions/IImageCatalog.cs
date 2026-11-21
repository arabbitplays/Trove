using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Abstractions;

public interface IImageCatalog
{
    Task<bool> ExistsAsync(string hash, CancellationToken cancellationToken);
    Task AddAsync(ImageRecord image, CancellationToken cancellationToken);
    Task<IReadOnlyList<ImageRecord>> ListAsync(string? tag, int skip, int take, CancellationToken cancellationToken);
    Task<int> CountAsync(string? tag, CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken cancellationToken);
    Task SetTagAsync(string hash, string tag, CancellationToken cancellationToken);
    Task RemoveTagAsync(string hash, string tag, CancellationToken cancellationToken);
}

public interface IImageStorage
{
    string RootPath { get; }
    Task<(string Hash, string Path)> SaveAsync(Stream content, string extension, CancellationToken cancellationToken);
    Task<string?> FindPathAsync(string hash, CancellationToken cancellationToken);
    IAsyncEnumerable<(string Hash, string Path)> EnumerateAsync(CancellationToken cancellationToken);
}

public interface IClock { DateTimeOffset UtcNow { get; } }
