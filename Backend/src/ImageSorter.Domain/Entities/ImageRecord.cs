namespace ImageSorter.Domain.Entities;

public sealed class ImageRecord
{
    private readonly List<ImageTag> _imageTags = [];

    private ImageRecord() { }

    public ImageRecord(string hash, string contentType, string originalName, DateTimeOffset addedAt)
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
    public ICollection<ImageTag> ImageTags => _imageTags;

    public void MarkClean() => Dirty = false;
}

public sealed class Tag
{
    private Tag() { }
    public Tag(string name) => Name = name;
    public string Name { get; private set; } = string.Empty;
    public ICollection<ImageTag> ImageTags { get; } = new List<ImageTag>();
}

public sealed class ImageTag
{
    private ImageTag() { }
    public ImageTag(string imageHash, string tagName) { ImageHash = imageHash; TagName = tagName; }
    public string ImageHash { get; private set; } = string.Empty;
    public ImageRecord Image { get; private set; } = null!;
    public string TagName { get; private set; } = string.Empty;
    public Tag Tag { get; private set; } = null!;
}
