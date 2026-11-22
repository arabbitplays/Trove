using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Abstractions;

public interface IPeriodCatalog
{
    Task<IReadOnlyList<Period>> ListPeriodsAsync(CancellationToken cancellationToken);
    Task<Period?> GetPeriodAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<ContentRecord>?> GetPeriodContentsAsync(Guid id, CancellationToken cancellationToken);
    Task CreatePeriodAsync(Period period, IReadOnlyList<string> contentHashes, CancellationToken cancellationToken);
    Task<bool> UpdatePeriodAsync(Guid id, string name, DateOnly startDate, DateOnly endDate, string? titleImageHash, CancellationToken cancellationToken);
    Task<bool> AddPeriodContentsAsync(Guid id, IReadOnlyList<string> hashes, IReadOnlyList<string> tags, bool allMatching, IReadOnlyList<string> excludedHashes, CancellationToken cancellationToken);
    Task<bool> RemovePeriodContentAsync(Guid id, string hash, CancellationToken cancellationToken);
}
