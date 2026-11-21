using ImageSorter.Application.Images;

namespace ImageSorter.Api.BackgroundServices;

public sealed class DuplicateImageWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<DuplicateImageWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<DuplicateImageService>();
                var result = await service.ProcessDirtyImagesAsync(stoppingToken);
                if (result.Processed > 0)
                    logger.LogInformation(
                        "Duplicate image worker completed: {Processed} dirty images checked, {Merged} duplicates merged, {Failed} images could not be decoded",
                        result.Processed, result.Merged, result.Failed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                logger.LogError(error, "The duplicate image job failed");
            }

            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
