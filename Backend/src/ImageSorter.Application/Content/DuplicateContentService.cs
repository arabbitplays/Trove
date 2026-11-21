using ImageSorter.Application.Abstractions;

namespace ImageSorter.Application.Content;

public sealed record DuplicateContentProcessingResult(int Processed, int Merged, int Failed);

public sealed class DuplicateContentService(IContentCatalog catalog, IContentStorage storage, IImageProcessor imageProcessor, IVideoProcessor videoProcessor)
{
    public async Task<DuplicateContentProcessingResult> ProcessDirtyContentAsync(CancellationToken ct)
    {
        var dirtyContent = await catalog.GetDirtyContentAsync(ct);
        if (dirtyContent.Count == 0) return new DuplicateContentProcessingResult(0, 0, 0);

        var fingerprints = new Dictionary<string, string?>(StringComparer.Ordinal);
        var durations = new Dictionary<string, TimeSpan?>(StringComparer.Ordinal);
        var contents = (await catalog.GetContentAsync(ct)).ToList();
        var processed = 0;
        var merged = 0;
        var failed = 0;

        foreach (var content in dirtyContent)
        {
            ct.ThrowIfCancellationRequested();
            processed++;

            var sourcePath = await storage.FindPathAsync(content.Hash, ct);
            if (sourcePath is null)
            {
                if (await catalog.ExistsAsync(content.Hash, ct))
                {
                    await catalog.MarkCleanAsync(content.Hash, ct);
                    failed++;
                }
                continue;
            }

            var sourceIsVideo = content.ContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
            var sourceDuration = sourceIsVideo ? GetDuration(content.Hash, sourcePath) : null;
            if (sourceIsVideo && sourceDuration is null)
            {
                await catalog.MarkCleanAsync(content.Hash, ct);
                failed++;
                continue;
            }
            var sourceFingerprint = GetFingerprint(content.Hash, sourcePath, sourceIsVideo);
            if (sourceFingerprint is null)
            {
                await catalog.MarkCleanAsync(content.Hash, ct);
                failed++;
                continue;
            }

            var foundDuplicate = false;
            foreach (var target in contents)
            {
                if (target.Hash == content.Hash) continue;
                var targetIsVideo = target.ContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
                if (sourceIsVideo != targetIsVideo) continue;

                var targetPath = await storage.FindPathAsync(target.Hash, ct);
                if (targetPath is null) continue;

                if (sourceIsVideo)
                {
                    var targetDuration = GetDuration(target.Hash, targetPath);
                    if (targetDuration is null) { failed++; continue; }
                    if (Math.Abs((sourceDuration!.Value - targetDuration.Value).TotalMilliseconds) > 20) continue;
                }

                var targetFingerprint = GetFingerprint(target.Hash, targetPath, targetIsVideo);
                if (targetFingerprint is null)
                {
                    failed++;
                    continue;
                }
                if (!string.Equals(sourceFingerprint, targetFingerprint, StringComparison.Ordinal)) continue;

                if (!await catalog.MergeTagsAndDeleteAsync(content.Hash, target.Hash, ct)) continue;
                await storage.DeleteAsync(content.Hash, ct);
                merged++;
                foundDuplicate = true;
                break;
            }

            if (foundDuplicate)
                contents.RemoveAll(candidate => candidate.Hash == content.Hash);
            else
                await catalog.MarkCleanAsync(content.Hash, ct);
        }

        return new DuplicateContentProcessingResult(processed, merged, failed);

        TimeSpan? GetDuration(string hash, string path)
        {
            if (durations.TryGetValue(hash, out var cached)) return cached;
            try
            {
                var duration = videoProcessor.GetDuration(path);
                durations[hash] = duration;
                return duration;
            }
            catch (IOException)
            {
                durations[hash] = null;
                return null;
            }
        }

        string? GetFingerprint(string hash, string path, bool isVideo)
        {
            if (fingerprints.TryGetValue(hash, out var cached)) return cached;
            try
            {
                var fingerprint = isVideo
                    ? videoProcessor.GetPixelFingerprint(path)
                    : imageProcessor.GetPixelFingerprint(path);
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
