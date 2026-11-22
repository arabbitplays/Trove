using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Content;

public sealed record PeriodDto(Guid Id, string Name, DateOnly StartDate, DateOnly EndDate, Guid? TitleImageId, IReadOnlyList<Guid> ContentIds);

public sealed class PeriodService(IPeriodCatalog catalog)
{
    public async Task<IReadOnlyList<PeriodDto>> ListAsync(CancellationToken ct) =>
        await Task.WhenAll((await catalog.ListPeriodsAsync(ct)).Select(ToDtoAsync));

    public async Task<PeriodDto?> GetAsync(Guid id, CancellationToken ct)
    {
        var period = await catalog.GetPeriodAsync(id, ct);
        return period is null ? null : await ToDtoAsync(period);
    }

    public async Task<IReadOnlyList<ContentDto>?> GetContentsAsync(Guid id, CancellationToken ct)
    {
        var contents = await catalog.GetPeriodContentsAsync(id, ct);
        return contents?.Select(content => new ContentDto(
            content.Id,
            content.AddedAt,
            content.TakenAt,
            content.ContentTags.Where(link => !link.Tag.IsAuto).Select(link => link.TagName).OrderBy(tag => tag, StringComparer.Ordinal).ToArray(),
            content.ContentTags.Where(link => link.Tag.IsAuto).Select(link => link.TagName).OrderBy(tag => tag, StringComparer.Ordinal).ToArray(),
            content.ContentType,
            content.Description)).ToArray();
    }

    public async Task<PeriodDto> CreateAsync(string name, DateOnly startDate, DateOnly endDate, IReadOnlyList<Guid>? contentIds, CancellationToken ct)
    {
        var normalizedName = NormalizeName(name);
        ValidateDates(startDate, endDate);
        var period = new Period(Guid.NewGuid(), normalizedName, startDate, endDate);
        await catalog.CreatePeriodAsync(period, contentIds ?? [], ct);
        return await ToDtoAsync((await catalog.GetPeriodAsync(period.Id, ct))!);
    }

    public async Task<bool> UpdateAsync(Guid id, string name, DateOnly startDate, DateOnly endDate, Guid? titleImageId, CancellationToken ct)
    {
        var normalizedName = NormalizeName(name);
        ValidateDates(startDate, endDate);
        return await catalog.UpdatePeriodAsync(id, normalizedName, startDate, endDate, titleImageId, ct);
    }

    public async Task<bool> AddContentsAsync(Guid id, IReadOnlyList<Guid>? contentIds, IReadOnlyList<string>? tags, bool allMatching, IReadOnlyList<Guid>? excludedIds, CancellationToken ct) =>
        await catalog.AddPeriodContentsAsync(
            id,
            contentIds ?? [],
            NormalizeTags(tags),
            allMatching,
            excludedIds ?? [],
            ct);

    public Task<bool> RemoveContentAsync(Guid id, Guid contentId, CancellationToken ct) => catalog.RemovePeriodContentAsync(id, contentId, ct);

    private async Task<PeriodDto> ToDtoAsync(Period period)
    {
        var contentIds = new List<Guid>();
        foreach (var link in period.Contents) contentIds.Add(link.ContentId);
        var titleImageId = period.TitleImageId;
        return new PeriodDto(
        period.Id,
        period.Name,
        period.StartDate,
        period.EndDate,
        titleImageId,
        contentIds.Order().ToArray());
    }

    private static string NormalizeName(string value)
    {
        var name = value.Trim();
        if (name.Length is 0 or > 200) throw new ArgumentException("Period names must contain between 1 and 200 characters.");
        return name;
    }

    private static void ValidateDates(DateOnly startDate, DateOnly endDate)
    {
        if (endDate < startDate) throw new ArgumentException("The end date must be on or after the start date.");
    }

    private static string[] NormalizeTags(IReadOnlyList<string>? values) => values?
        .Where(value => !string.IsNullOrWhiteSpace(value))
        .Select(value => value.Trim().ToLowerInvariant())
        .Distinct(StringComparer.Ordinal)
        .ToArray() ?? [];
}
