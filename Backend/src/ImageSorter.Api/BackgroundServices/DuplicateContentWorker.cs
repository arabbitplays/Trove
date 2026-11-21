using ImageSorter.Application.Content;

namespace ImageSorter.Api.BackgroundServices;

public sealed class DuplicateContentWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<DuplicateContentWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<DuplicateContentService>();
                var result = await service.ProcessDirtyContentAsync(stoppingToken);
                if (result.Processed > 0)
                    logger.LogInformation(
                        "Duplicate content worker completed: {Processed} dirty items checked, {Merged} duplicates merged, {Failed} items could not be decoded",
                        result.Processed, result.Merged, result.Failed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                logger.LogError(error, "The duplicate content job failed");
            }

            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
