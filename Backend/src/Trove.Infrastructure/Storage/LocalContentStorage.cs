using Trove.Application.Abstractions;

namespace Trove.Infrastructure.Storage;

public sealed class LocalContentStorage : IContentStorage
{
    public LocalContentStorage(string rootPath)
    {
        RootPath = Path.GetFullPath(rootPath);
        Directory.CreateDirectory(RootPath);
    }

    public string RootPath { get; }

    public async Task<string> SaveAsync(Stream content, string extension, Guid id, CancellationToken ct)
    {
        var temporary = Path.Combine(RootPath, $".{Guid.NewGuid():N}.upload");
        try
        {
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
                await content.CopyToAsync(output, ct);
            var destination = Path.Combine(RootPath, id.ToString("D") + extension.ToLowerInvariant());
            if (File.Exists(destination)) throw new IOException($"A file already exists for content '{id}'.");
            File.Move(temporary, destination);
            return destination;
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    public Task DeleteAsync(Guid id, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var name = id.ToString("D");

        foreach (var path in Directory.EnumerateFiles(RootPath, name + ".*"))
            File.Delete(path);
        var thumbnail = Path.Combine(RootPath, ".thumbnails", name + ".jpg");
        if (File.Exists(thumbnail)) File.Delete(thumbnail);
        return Task.CompletedTask;
    }

    public Task<string?> FindPathAsync(Guid id, CancellationToken ct)
    {
        var path = Directory.EnumerateFiles(RootPath, id.ToString("D") + ".*").FirstOrDefault();
        return Task.FromResult(path);
    }

    public async IAsyncEnumerable<(Guid Id, string Path)> EnumerateAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        foreach (var path in Directory.EnumerateFiles(RootPath))
        {
            ct.ThrowIfCancellationRequested();
            var name = Path.GetFileName(path);
            if (name.StartsWith('.') || name.EndsWith(".upload", StringComparison.OrdinalIgnoreCase)) continue;
            var idText = Path.GetFileNameWithoutExtension(name);
            if (Guid.TryParse(idText, out var id)) yield return (id, path);
            await Task.Yield();
        }
    }

}

public sealed class SystemClock : IClock { public DateTimeOffset UtcNow => DateTimeOffset.UtcNow; }
