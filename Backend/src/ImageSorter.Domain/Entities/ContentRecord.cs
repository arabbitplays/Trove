namespace ImageSorter.Domain.Entities;

public sealed class ContentRecord
{
    private readonly List<ContentTag> _contentTags = [];

    private ContentRecord() { }

    public ContentRecord(Guid id, string contentType, DateTimeOffset addedAt, DateOnly? takenAt, string description = "", bool dirty = true)
    {
        Id = id;
        ContentType = contentType;
        AddedAt = addedAt;
        TakenAt = takenAt;
        Description = description;
        Dirty = dirty;
    }

    public Guid Id { get; private set; }
    public string ContentType { get; private set; } = "application/octet-stream";
    public DateTimeOffset AddedAt { get; private set; }
    public DateOnly? TakenAt { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public bool Dirty { get; private set; } = true;
    public ICollection<ContentTag> ContentTags => _contentTags;

    public void MarkClean() => Dirty = false;
    public void UpdateTakenAt(DateOnly? takenAt) => TakenAt = takenAt;
    public void UpdateDescription(string description) => Description = description;
    public void MergeDescription(string description)
    {
        if (string.IsNullOrWhiteSpace(description)) return;
        Description = string.IsNullOrWhiteSpace(Description) ? description : $"{Description}\n{description}";
    }
    public void MergeTakenAt(ContentRecord source)
    {
        if (TakenAt is null)
        {
            TakenAt = source.TakenAt;
            return;
        }
        if (source.TakenAt is null) return;

        if ((!source.Dirty && Dirty) || (source.Dirty == Dirty && source.AddedAt < AddedAt))
            TakenAt = source.TakenAt;
    }
}

public sealed class DeletedContentRecord
{
    private DeletedContentRecord() { }
    public DeletedContentRecord(ContentRecord content, DateTimeOffset deletedAt, string tagsJson, string periodLinksJson, string titlePeriodIdsJson)
    {
        Id = content.Id;
        ContentType = content.ContentType;
        AddedAt = content.AddedAt;
        TakenAt = content.TakenAt;
        Dirty = content.Dirty;
        Description = content.Description;
        DeletedAt = deletedAt;
        TagsJson = tagsJson;
        PeriodLinksJson = periodLinksJson;
        TitlePeriodIdsJson = titlePeriodIdsJson;
    }
    public Guid Id { get; private set; }
    public string ContentType { get; private set; } = "application/octet-stream";
    public DateTimeOffset AddedAt { get; private set; }
    public DateOnly? TakenAt { get; private set; }
    public bool Dirty { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public DateTimeOffset DeletedAt { get; private set; }
    public string TagsJson { get; private set; } = "[]";
    public string PeriodLinksJson { get; private set; } = "[]";
    public string TitlePeriodIdsJson { get; private set; } = "[]";
}

public sealed record DeletedTagSnapshot(string Name, bool IsAuto);

public sealed class Tag
{
    private Tag() { }
    public Tag(string name, bool isAuto = false) { Name = name; IsAuto = isAuto; }
    public string Name { get; private set; } = string.Empty;
    public bool IsAuto { get; private set; }
    public ICollection<ContentTag> ContentTags { get; } = new List<ContentTag>();
    public void MarkAuto() => IsAuto = true;
}

public sealed class ContentTag
{
    private ContentTag() { }
    public ContentTag(Guid contentId, string tagName) { ContentId = contentId; TagName = tagName; }
    public Guid ContentId { get; private set; }
    public ContentRecord Content { get; private set; } = null!;
    public string TagName { get; private set; } = string.Empty;
    public Tag Tag { get; private set; } = null!;
}
