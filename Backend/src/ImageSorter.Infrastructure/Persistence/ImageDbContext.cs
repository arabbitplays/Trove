using ImageSorter.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Infrastructure.Persistence;

public sealed class ImageDbContext(DbContextOptions<ImageDbContext> options) : DbContext(options)
{
    public DbSet<ImageRecord> Images => Set<ImageRecord>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<ImageTag> ImageTags => Set<ImageTag>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ImageRecord>(entity =>
        {
            entity.ToTable("images");
            entity.HasKey(image => image.Hash);
            entity.Property(image => image.Hash).HasMaxLength(64);
            entity.Property(image => image.ContentType).HasMaxLength(100).IsRequired();
            entity.Property(image => image.OriginalName).HasMaxLength(255).IsRequired();
            entity.Property(image => image.AddedAt).HasColumnType("timestamp with time zone").IsRequired();
            entity.HasIndex(image => image.AddedAt);
        });
        modelBuilder.Entity<Tag>(entity =>
        {
            entity.ToTable("tags");
            entity.HasKey(tag => tag.Name);
            entity.Property(tag => tag.Name).HasMaxLength(50);
        });
        modelBuilder.Entity<ImageTag>(entity =>
        {
            entity.ToTable("image_tags");
            entity.HasKey(link => new { link.ImageHash, link.TagName });
            entity.HasOne(link => link.Image).WithMany(image => image.ImageTags).HasForeignKey(link => link.ImageHash).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(link => link.Tag).WithMany(tag => tag.ImageTags).HasForeignKey(link => link.TagName).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
