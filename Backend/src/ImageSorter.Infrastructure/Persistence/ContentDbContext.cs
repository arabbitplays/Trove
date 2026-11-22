using ImageSorter.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Infrastructure.Persistence;

public sealed class ContentDbContext(DbContextOptions<ContentDbContext> options) : DbContext(options)
{
    public DbSet<ContentRecord> Contents => Set<ContentRecord>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<ContentTag> ContentTags => Set<ContentTag>();
    public DbSet<Period> Periods => Set<Period>();
    public DbSet<PeriodContent> PeriodContents => Set<PeriodContent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ContentRecord>(entity =>
        {
            entity.ToTable("contents");
            entity.HasKey(content => content.Id);
            entity.Property(content => content.Id).HasColumnName("id").HasColumnType("uuid").IsRequired();
            entity.Property(content => content.ContentType).HasMaxLength(100).IsRequired();
            entity.Property(content => content.Description).HasColumnType("text").IsRequired();
            entity.Property(content => content.AddedAt).HasColumnType("timestamp with time zone").IsRequired();
            entity.Property(content => content.TakenAt).HasColumnName("taken_at").HasColumnType("date");
            entity.Property(content => content.Dirty).HasColumnName("dirty").HasDefaultValue(true).IsRequired();
            entity.HasIndex(content => content.AddedAt);
            entity.HasIndex(content => content.Dirty);
        });
        modelBuilder.Entity<Tag>(entity =>
        {
            entity.ToTable("tags");
            entity.HasKey(tag => tag.Name);
            entity.Property(tag => tag.Name).HasMaxLength(50);
            entity.Property(tag => tag.IsAuto).HasColumnName("is_auto").HasDefaultValue(false).IsRequired();
        });
        modelBuilder.Entity<ContentTag>(entity =>
        {
            entity.ToTable("content_tags");
            entity.HasKey(link => new { link.ContentId, link.TagName });
            entity.Property(link => link.ContentId).HasColumnName("content_id").HasColumnType("uuid");
            entity.HasOne(link => link.Content).WithMany(content => content.ContentTags).HasForeignKey(link => link.ContentId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(link => link.Tag).WithMany(tag => tag.ContentTags).HasForeignKey(link => link.TagName).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Period>(entity =>
        {
            entity.ToTable("periods");
            entity.HasKey(period => period.Id);
            entity.Property(period => period.Id).HasColumnName("id");
            entity.Property(period => period.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property(period => period.StartDate).HasColumnName("start_date").HasColumnType("date").IsRequired();
            entity.Property(period => period.EndDate).HasColumnName("end_date").HasColumnType("date").IsRequired();
            entity.Property(period => period.TitleImageId).HasColumnName("title_image_id").HasColumnType("uuid");
            entity.HasOne<ContentRecord>().WithMany().HasForeignKey(period => period.TitleImageId).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<PeriodContent>(entity =>
        {
            entity.ToTable("period_contents");
            entity.HasKey(link => new { link.PeriodId, link.ContentId });
            entity.Property(link => link.PeriodId).HasColumnName("period_id");
            entity.Property(link => link.ContentId).HasColumnName("content_id").HasColumnType("uuid");
            entity.HasOne(link => link.Period).WithMany(period => period.Contents).HasForeignKey(link => link.PeriodId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(link => link.Content).WithMany().HasForeignKey(link => link.ContentId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
