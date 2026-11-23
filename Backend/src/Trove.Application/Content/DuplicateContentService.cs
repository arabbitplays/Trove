using Trove.Application.Abstractions;

namespace Trove.Application.Content;

public sealed record DuplicateContentProcessingResult(int Processed, int Merged, int Failed);

public sealed class DuplicateContentService(IContentCatalog catalog, IContentStorage storage, IImageProcessor imageProcessor, IVideoProcessor videoProcessor)
{
    public async Task<DuplicateContentProcessingResult> ProcessDirtyContentAsync(CancellationToken ct)
    {
        var dirtyContent = await catalog.GetDirtyContentAsync(ct);
        if (dirtyContent.Count == 0) return new DuplicateContentProcessingResult(0, 0, 0);

        var fingerprints = new Dictionary<Guid, string?>();
        var durations = new Dictionary<Guid, TimeSpan?>();
        var contents = (await catalog.GetContentAsync(ct)).ToList();
        var processed = 0;
        var merged = 0;
        var failed = 0;

        foreach (var content in dirtyContent)
        {
            ct.ThrowIfCancellationRequested();
            processed++;

            var sourcePath = await storage.FindPathAsync(content.Id, ct);
            if (sourcePath is null)
            {
                if (await catalog.ExistsAsync(content.Id, ct))
                {
                    await catalog.MarkCleanAsync(content.Id, ct);
                    failed++;
                }
                continue;
            }

            var sourceIsVideo = content.ContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
            var sourceDuration = sourceIsVideo ? GetDuration(content.Id, sourcePath) : null;
            if (sourceIsVideo && sourceDuration is null)
            {
                await catalog.MarkCleanAsync(content.Id, ct);
                failed++;
                continue;
            }
            var sourceFingerprint = GetFingerprint(content.Id, sourcePath, sourceIsVideo);
            if (sourceFingerprint is null)
            {
                await catalog.MarkCleanAsync(content.Id, ct);
                failed++;
                continue;
            }

            var foundDuplicate = false;
            foreach (var target in contents)
            {
                if (target.Id == content.Id) continue;
                var targetIsVideo = target.ContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
                if (sourceIsVideo != targetIsVideo) continue;

                var targetPath = await storage.FindPathAsync(target.Id, ct);
                if (targetPath is null) continue;

                if (sourceIsVideo)
                {
                    var targetDuration = GetDuration(target.Id, targetPath);
                    if (targetDuration is null) { failed++; continue; }
                    if (Math.Abs((sourceDuration!.Value - targetDuration.Value).TotalMilliseconds) > 20) continue;
                }

                var targetFingerprint = GetFingerprint(target.Id, targetPath, targetIsVideo);
                if (targetFingerprint is null)
                {
                    failed++;
                    continue;
                }
                if (!string.Equals(sourceFingerprint, targetFingerprint, StringComparison.Ordinal)) continue;

                if (!await catalog.MergeTagsAndDeleteAsync(content.Id, target.Id, ct)) continue;
                await storage.DeleteAsync(content.Id, ct);
                merged++;
                foundDuplicate = true;
                break;
            }

            if (foundDuplicate)
                contents.RemoveAll(candidate => candidate.Id == content.Id);
            else
                await catalog.MarkCleanAsync(content.Id, ct);
        }

        return new DuplicateContentProcessingResult(processed, merged, failed);

        TimeSpan? GetDuration(Guid id, string path)
        {
            if (durations.TryGetValue(id, out var cached)) return cached;
            try
            {
                var duration = videoProcessor.GetDuration(path);
                durations[id] = duration;
                return duration;
            }
            catch (IOException)
            {
                durations[id] = null;
                return null;
            }
        }

        string? GetFingerprint(Guid id, string path, bool isVideo)
        {
            if (fingerprints.TryGetValue(id, out var cached)) return cached;
            try
            {
                var fingerprint = isVideo
                    ? videoProcessor.GetPixelFingerprint(path)
                    : imageProcessor.GetPixelFingerprint(path);
                fingerprints[id] = fingerprint;
                return fingerprint;
            }
            catch (IOException)
            {
                fingerprints[id] = null;
                return null;
            }
        }
    }
}
