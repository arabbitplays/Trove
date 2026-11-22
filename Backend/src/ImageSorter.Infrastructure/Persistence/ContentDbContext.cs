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
            entity.HasKey(content => content.Hash);
            entity.Property(content => content.Hash).HasMaxLength(64);
            entity.Property(content => content.ContentType).HasMaxLength(100).IsRequired();
            entity.Property(content => content.OriginalName).HasMaxLength(255).IsRequired();
            entity.Property(content => content.Description).HasColumnType("text").IsRequired();
            entity.Property(content => content.AddedAt).HasColumnType("timestamp with time zone").IsRequired();
            entity.Property(content => content.Dirty).HasColumnName("dirty").HasDefaultValue(true).IsRequired();
            entity.HasIndex(content => content.AddedAt);
            entity.HasIndex(content => content.Dirty);
        });
        modelBuilder.Entity<Tag>(entity =>
        {
            entity.ToTable("tags");
            entity.HasKey(tag => tag.Name);
            entity.Property(tag => tag.Name).HasMaxLength(50);
        });
        modelBuilder.Entity<ContentTag>(entity =>
        {
            entity.ToTable("content_tags");
            entity.HasKey(link => new { link.ContentHash, link.TagName });
            entity.HasOne(link => link.Content).WithMany(content => content.ContentTags).HasForeignKey(link => link.ContentHash).OnDelete(DeleteBehavior.Cascade);
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
            entity.Property(period => period.TitleImageHash).HasColumnName("title_image_hash").HasMaxLength(64);
            entity.HasOne<ContentRecord>().WithMany().HasForeignKey(period => period.TitleImageHash).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<PeriodContent>(entity =>
        {
            entity.ToTable("period_contents");
            entity.HasKey(link => new { link.PeriodId, link.ContentHash });
            entity.Property(link => link.PeriodId).HasColumnName("period_id");
            entity.Property(link => link.ContentHash).HasColumnName("content_hash").HasMaxLength(64);
            entity.HasOne(link => link.Period).WithMany(period => period.Contents).HasForeignKey(link => link.PeriodId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(link => link.Content).WithMany().HasForeignKey(link => link.ContentHash).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
