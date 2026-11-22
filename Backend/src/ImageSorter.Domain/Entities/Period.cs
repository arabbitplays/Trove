namespace ImageSorter.Domain.Entities;

public sealed class Period
{
    private readonly List<PeriodContent> _contents = [];

    private Period() { }

    public Period(Guid id, string name, DateOnly startDate, DateOnly endDate)
    {
        Id = id;
        Update(name, startDate, endDate);
    }

    public Guid Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public DateOnly StartDate { get; private set; }
    public DateOnly EndDate { get; private set; }
    public Guid? TitleImageId { get; private set; }
    public ICollection<PeriodContent> Contents => _contents;

    public void Update(string name, DateOnly startDate, DateOnly endDate)
    {
        Name = name;
        StartDate = startDate;
        EndDate = endDate;
    }

    public void SetTitleImage(Guid? id) => TitleImageId = id;
}

public sealed class PeriodContent
{
    private PeriodContent() { }

    public PeriodContent(Guid periodId, Guid contentId)
    {
        PeriodId = periodId;
        ContentId = contentId;
    }

    public Guid PeriodId { get; private set; }
    public Period Period { get; private set; } = null!;
    public Guid ContentId { get; private set; }
    public ContentRecord Content { get; private set; } = null!;
}
