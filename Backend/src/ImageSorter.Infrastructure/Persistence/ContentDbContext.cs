using ImageSorter.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Infrastructure.Persistence;

public sealed class ContentDbContext(DbContextOptions<ContentDbContext> options) : DbContext(options)
{
    public DbSet<ContentRecord> Contents => Set<ContentRecord>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<ContentTag> ContentTags => Set<ContentTag>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ContentRecord>(entity =>
        {
            entity.ToTable("contents");
            entity.HasKey(content => content.Hash);
            entity.Property(content => content.Hash).HasMaxLength(64);
            entity.Property(content => content.ContentType).HasMaxLength(100).IsRequired();
            entity.Property(content => content.OriginalName).HasMaxLength(255).IsRequired();
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
    }
}
