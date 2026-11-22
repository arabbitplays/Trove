using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Content;

public sealed record PeriodDto(Guid Id, string Name, DateOnly StartDate, DateOnly EndDate, string? TitleImageHash, IReadOnlyList<string> ContentHashes);

public sealed class PeriodService(IPeriodCatalog catalog)
{
    public async Task<IReadOnlyList<PeriodDto>> ListAsync(CancellationToken ct) =>
        (await catalog.ListPeriodsAsync(ct)).Select(ToDto).ToArray();

    public async Task<PeriodDto?> GetAsync(Guid id, CancellationToken ct)
    {
        var period = await catalog.GetPeriodAsync(id, ct);
        return period is null ? null : ToDto(period);
    }

    public async Task<IReadOnlyList<ContentDto>?> GetContentsAsync(Guid id, CancellationToken ct)
    {
        var contents = await catalog.GetPeriodContentsAsync(id, ct);
        return contents?.Select(content => new ContentDto(
            content.Hash,
            content.AddedAt,
            content.TakenAt,
            content.ContentTags.Where(link => !link.Tag.IsAuto).Select(link => link.TagName).OrderBy(tag => tag, StringComparer.Ordinal).ToArray(),
            content.ContentTags.Where(link => link.Tag.IsAuto).Select(link => link.TagName).OrderBy(tag => tag, StringComparer.Ordinal).ToArray(),
            content.ContentType,
            content.Description)).ToArray();
    }

    public async Task<PeriodDto> CreateAsync(string name, DateOnly startDate, DateOnly endDate, IReadOnlyList<string>? contentHashes, CancellationToken ct)
    {
        var normalizedName = NormalizeName(name);
        ValidateDates(startDate, endDate);
        var period = new Period(Guid.NewGuid(), normalizedName, startDate, endDate);
        await catalog.CreatePeriodAsync(period, contentHashes ?? [], ct);
        return ToDto((await catalog.GetPeriodAsync(period.Id, ct))!);
    }

    public async Task<bool> UpdateAsync(Guid id, string name, DateOnly startDate, DateOnly endDate, string? titleImageHash, CancellationToken ct)
    {
        var normalizedName = NormalizeName(name);
        ValidateDates(startDate, endDate);
        return await catalog.UpdatePeriodAsync(id, normalizedName, startDate, endDate, string.IsNullOrWhiteSpace(titleImageHash) ? null : titleImageHash, ct);
    }

    public Task<bool> AddContentsAsync(Guid id, IReadOnlyList<string>? hashes, IReadOnlyList<string>? tags, bool allMatching, IReadOnlyList<string>? excludedHashes, CancellationToken ct) =>
        catalog.AddPeriodContentsAsync(
            id,
            hashes ?? [],
            NormalizeTags(tags),
            allMatching,
            excludedHashes ?? [],
            ct);

    public Task<bool> RemoveContentAsync(Guid id, string hash, CancellationToken ct) => catalog.RemovePeriodContentAsync(id, hash, ct);

    private static PeriodDto ToDto(Period period) => new(
        period.Id,
        period.Name,
        period.StartDate,
        period.EndDate,
        period.TitleImageHash,
        period.Contents.Select(link => link.ContentHash).OrderBy(hash => hash, StringComparer.Ordinal).ToArray());

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
