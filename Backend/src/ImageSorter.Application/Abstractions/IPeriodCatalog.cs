using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Abstractions;

public interface IPeriodCatalog
{
    Task<IReadOnlyList<Period>> ListPeriodsAsync(CancellationToken cancellationToken);
    Task<Period?> GetPeriodAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<ContentRecord>?> GetPeriodContentsAsync(Guid id, CancellationToken cancellationToken);
    Task CreatePeriodAsync(Period period, IReadOnlyList<Guid> contentIds, CancellationToken cancellationToken);
    Task<bool> UpdatePeriodAsync(Guid id, string name, DateOnly startDate, DateOnly endDate, Guid? titleImageId, CancellationToken cancellationToken);
    Task<bool> AddPeriodContentsAsync(Guid id, IReadOnlyList<Guid> contentIds, IReadOnlyList<string> tags, bool allMatching, IReadOnlyList<Guid> excludedIds, CancellationToken cancellationToken);
    Task<bool> RemovePeriodContentAsync(Guid id, Guid contentId, CancellationToken cancellationToken);
    Task<bool> DeletePeriodAsync(Guid id, CancellationToken cancellationToken);
}
