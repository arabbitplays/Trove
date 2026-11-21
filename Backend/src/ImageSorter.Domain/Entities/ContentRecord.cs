namespace ImageSorter.Domain.Entities;

public sealed class ContentRecord
{
    private readonly List<ContentTag> _contentTags = [];

    private ContentRecord() { }

    public ContentRecord(string hash, string contentType, string originalName, DateTimeOffset addedAt)
    {
        Hash = hash;
        ContentType = contentType;
        OriginalName = originalName;
        AddedAt = addedAt;
    }

    public string Hash { get; private set; } = string.Empty;
    public string ContentType { get; private set; } = "application/octet-stream";
    public string OriginalName { get; private set; } = string.Empty;
    public DateTimeOffset AddedAt { get; private set; }
    public bool Dirty { get; private set; } = true;
    public ICollection<ContentTag> ContentTags => _contentTags;

    public void MarkClean() => Dirty = false;
}

public sealed class Tag
{
    private Tag() { }
    public Tag(string name) => Name = name;
    public string Name { get; private set; } = string.Empty;
    public ICollection<ContentTag> ContentTags { get; } = new List<ContentTag>();
}

public sealed class ContentTag
{
    private ContentTag() { }
    public ContentTag(string contentHash, string tagName) { ContentHash = contentHash; TagName = tagName; }
    public string ContentHash { get; private set; } = string.Empty;
    public ContentRecord Content { get; private set; } = null!;
    public string TagName { get; private set; } = string.Empty;
    public Tag Tag { get; private set; } = null!;
}
