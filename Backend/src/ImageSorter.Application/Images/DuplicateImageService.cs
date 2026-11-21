using ImageSorter.Application.Abstractions;

namespace ImageSorter.Application.Images;

public sealed record DuplicateProcessingResult(int Processed, int Merged, int Failed);

public sealed class DuplicateImageService(IImageCatalog catalog, IImageStorage storage, IImageProcessor imageProcessor)
{
    public async Task<DuplicateProcessingResult> ProcessDirtyImagesAsync(CancellationToken ct)
    {
        var dirtyImages = await catalog.GetDirtyImagesAsync(ct);
        if (dirtyImages.Count == 0) return new DuplicateProcessingResult(0, 0, 0);

        var fingerprints = new Dictionary<string, string?>(StringComparer.Ordinal);
        var imageHashes = (await catalog.GetImageHashesAsync(ct)).ToList();
        var processed = 0;
        var merged = 0;
        var failed = 0;

        foreach (var image in dirtyImages)
        {
            ct.ThrowIfCancellationRequested();
            processed++;

            var sourcePath = await storage.FindPathAsync(image.Hash, ct);
            if (sourcePath is null)
            {
                if (await catalog.ExistsAsync(image.Hash, ct))
                {
                    await catalog.MarkCleanAsync(image.Hash, ct);
                    failed++;
                }
                continue;
            }

            var sourceFingerprint = GetFingerprint(image.Hash, sourcePath);
            if (sourceFingerprint is null)
            {
                await catalog.MarkCleanAsync(image.Hash, ct);
                failed++;
                continue;
            }

            var foundDuplicate = false;
            foreach (var targetHash in imageHashes)
            {
                if (targetHash == image.Hash) continue;

                var targetPath = await storage.FindPathAsync(targetHash, ct);
                if (targetPath is null) continue;

                var targetFingerprint = GetFingerprint(targetHash, targetPath);
                if (targetFingerprint is null)
                {
                    failed++;
                    continue;
                }
                if (!string.Equals(sourceFingerprint, targetFingerprint, StringComparison.Ordinal)) continue;

                if (!await catalog.MergeTagsAndDeleteAsync(image.Hash, targetHash, ct)) continue;
                await storage.DeleteAsync(image.Hash, ct);
                merged++;
                foundDuplicate = true;
                break;
            }

            if (foundDuplicate)
                imageHashes.Remove(image.Hash);
            else
                await catalog.MarkCleanAsync(image.Hash, ct);
        }

        return new DuplicateProcessingResult(processed, merged, failed);

        string? GetFingerprint(string hash, string path)
        {
            if (fingerprints.TryGetValue(hash, out var cached)) return cached;
            try
            {
                var fingerprint = imageProcessor.GetPixelFingerprint(path);
                fingerprints[hash] = fingerprint;
                return fingerprint;
            }
            catch (IOException)
            {
                fingerprints[hash] = null;
                return null;
            }
        }
    }
}
