using ImageSorter.Application.Abstractions;
using ImageSorter.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ImageSorter.Api.BackgroundServices;

public sealed class DeletedContentWorker(IServiceScopeFactory scopeFactory, ILogger<DeletedContentWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromDays(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<ContentDbContext>();
                var storage = scope.ServiceProvider.GetRequiredService<IContentStorage>();
                var expired = await db.DeletedContents.AsNoTracking()
                    .Where(item => item.DeletedAt <= DateTimeOffset.UtcNow.AddDays(-30))
                    .Select(item => item.Id).ToListAsync(stoppingToken);
                foreach (var id in expired)
                {
                    await storage.DeleteAsync(id, stoppingToken);
                    await db.DeletedContents.Where(item => item.Id == id).ExecuteDeleteAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogError(error, "Failed to purge expired deleted content"); }
        }
    }
}
