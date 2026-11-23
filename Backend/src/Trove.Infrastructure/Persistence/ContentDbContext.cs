using Trove.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Trove.Infrastructure.Persistence;

public sealed class ContentDbContext(DbContextOptions<ContentDbContext> options) : DbContext(options)
{
    public DbSet<ContentRecord> Contents => Set<ContentRecord>();
    public DbSet<DeletedContentRecord> DeletedContents => Set<DeletedContentRecord>();
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
        modelBuilder.Entity<DeletedContentRecord>(entity =>
        {
            entity.ToTable("deleted_contents");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasColumnName("id").HasColumnType("uuid");
            entity.Property(item => item.ContentType).HasColumnName("content_type").HasMaxLength(100).IsRequired();
            entity.Property(item => item.AddedAt).HasColumnName("added_at").HasColumnType("timestamp with time zone").IsRequired();
            entity.Property(item => item.TakenAt).HasColumnName("taken_at").HasColumnType("date");
            entity.Property(item => item.Dirty).HasColumnName("dirty").IsRequired();
            entity.Property(item => item.Description).HasColumnName("description").HasColumnType("text").IsRequired();
            entity.Property(item => item.DeletedAt).HasColumnName("deleted_at").HasColumnType("timestamp with time zone").IsRequired();
            entity.Property(item => item.TagsJson).HasColumnName("tags_json").HasColumnType("jsonb").IsRequired();
            entity.Property(item => item.PeriodLinksJson).HasColumnName("period_links_json").HasColumnType("jsonb").IsRequired();
            entity.Property(item => item.TitlePeriodIdsJson).HasColumnName("title_period_ids_json").HasColumnType("jsonb").IsRequired();
            entity.HasIndex(item => item.DeletedAt);
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
            entity.HasIndex(link => link.ContentId);
            entity.HasOne(link => link.Period).WithMany(period => period.Contents).HasForeignKey(link => link.PeriodId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(link => link.Content).WithMany().HasForeignKey(link => link.ContentId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
