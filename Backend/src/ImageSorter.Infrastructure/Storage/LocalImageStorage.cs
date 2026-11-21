using System.Security.Cryptography;
using ImageSorter.Application.Abstractions;

namespace ImageSorter.Infrastructure.Storage;

public sealed class LocalImageStorage : IImageStorage
{
    public LocalImageStorage(string rootPath)
    {
        RootPath = Path.GetFullPath(rootPath);
        Directory.CreateDirectory(RootPath);
    }

    public string RootPath { get; }

    public async Task<(string Hash, string Path)> SaveAsync(Stream content, string extension, CancellationToken ct)
    {
        var temporary = Path.Combine(RootPath, $".{Guid.NewGuid():N}.upload");
        try
        {
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
                await content.CopyToAsync(output, ct);
            await using var input = File.OpenRead(temporary);
            var hash = Convert.ToHexString(await SHA256.HashDataAsync(input, ct)).ToLowerInvariant();
            var destination = Directory.EnumerateFiles(RootPath, hash + ".*").FirstOrDefault()
                ?? Path.Combine(RootPath, hash + extension.ToLowerInvariant());
            if (!File.Exists(destination)) File.Move(temporary, destination);
            return (hash, destination);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    public async Task<(string Hash, string Path)> CopyAsync(string hash, CancellationToken ct)
    {
        var source = await FindPathAsync(hash, ct) ?? throw new FileNotFoundException("The source image was not found.");
        var extension = Path.GetExtension(source);
        string duplicateHash;
        string destination;
        do
        {
            duplicateHash = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            destination = Path.Combine(RootPath, duplicateHash + extension);
        } while (File.Exists(destination));

        try
        {
            await using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true);
            await using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
            await input.CopyToAsync(output, ct);
            return (duplicateHash, destination);
        }
        catch
        {
            if (File.Exists(destination)) File.Delete(destination);
            throw;
        }
    }

    public Task<string?> FindPathAsync(string hash, CancellationToken ct)
    {
        if (!IsHash(hash)) return Task.FromResult<string?>(null);
        var path = Directory.EnumerateFiles(RootPath, hash + ".*").FirstOrDefault();
        return Task.FromResult(path);
    }

    public async IAsyncEnumerable<(string Hash, string Path)> EnumerateAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        foreach (var path in Directory.EnumerateFiles(RootPath))
        {
            ct.ThrowIfCancellationRequested();
            var name = Path.GetFileName(path);
            if (name.StartsWith('.') || name.EndsWith(".upload", StringComparison.OrdinalIgnoreCase)) continue;
            var hash = Path.GetFileNameWithoutExtension(name);
            if (IsHash(hash)) yield return (hash, path);
            await Task.Yield();
        }
    }

    private static bool IsHash(string value) => value.Length == 64 && value.All(Uri.IsHexDigit);
}

public sealed class SystemClock : IClock { public DateTimeOffset UtcNow => DateTimeOffset.UtcNow; }
