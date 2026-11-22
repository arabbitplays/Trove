using ImageSorter.Application.Abstractions;
using ImageSorter.Application.Content;
using ImageSorter.Api.BackgroundServices;
using ImageSorter.Infrastructure.Persistence;
using ImageSorter.Infrastructure.Storage;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;
using NLog;
using NLog.Web;

var bootstrapLogger = LogManager.Setup()
    .LoadConfigurationFromFile(Path.Combine(AppContext.BaseDirectory, "NLog.config"))
    .GetCurrentClassLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);
    builder.Logging.ClearProviders();
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", Microsoft.Extensions.Logging.LogLevel.Trace);
    builder.Host.UseNLog();
    builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 2L * 1024 * 1024 * 1024);
    var connectionString = builder.Configuration.GetConnectionString("Contents")
        ?? builder.Configuration.GetConnectionString("Images")
        ?? "Host=localhost;Port=5432;Database=imagemanager;Username=imagemanager;Password=imagemanager";
    var contentPath = builder.Configuration["ContentStorage:Path"]
        ?? builder.Configuration["ImageStorage:Path"]
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Resources", "Images");

    builder.Services.AddDbContext<ContentDbContext>(options => options
        .UseNpgsql(connectionString)
        .ConfigureWarnings(warnings => warnings.Log((RelationalEventId.CommandExecuted, Microsoft.Extensions.Logging.LogLevel.Trace))));
    builder.Services.AddScoped<IContentCatalog, EfContentCatalog>();
    builder.Services.AddScoped<IPeriodCatalog>(services => (EfContentCatalog)services.GetRequiredService<IContentCatalog>());
    builder.Services.AddSingleton(_ => new LocalContentStorage(contentPath));
    builder.Services.AddSingleton<IContentStorage>(services => services.GetRequiredService<LocalContentStorage>());
    builder.Services.AddSingleton<IImageProcessor, MagickImageProcessor>();
    builder.Services.AddSingleton<IVideoProcessor, FfmpegVideoProcessor>();
    builder.Services.AddSingleton<IClock, SystemClock>();
    builder.Services.AddScoped<ContentService>();
    builder.Services.AddScoped<TagService>();
    builder.Services.AddScoped<PeriodService>();
    builder.Services.AddScoped<DuplicateContentService>();
    builder.Services.AddHostedService<DuplicateContentWorker>();
    builder.Services.AddControllers();
    var allowedOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"];
    builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
        .SetIsOriginAllowed(origin =>
            allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)
            || (builder.Environment.IsDevelopment() && Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback))
        .AllowAnyHeader()
        .AllowAnyMethod()));
    builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options => options.MultipartBodyLengthLimit = 2L * 1024 * 1024 * 1024);

    var app = builder.Build();

    app.Use(async (context, next) =>
    {
        var timer = Stopwatch.StartNew();
        Exception? failure = null;
        try
        {
            await next(context);
        }
        catch (Exception exception)
        {
            failure = exception;
            throw;
        }
        finally
        {
            timer.Stop();
            if (!string.Equals(context.Request.Path.Value, "/api/health", StringComparison.OrdinalIgnoreCase))
            {
                if (failure is null)
                    app.Logger.LogInformation("HTTP {Method} {Path} returned {StatusCode} in {ElapsedMilliseconds} ms",
                        context.Request.Method, context.Request.Path, context.Response.StatusCode, timer.ElapsedMilliseconds);
                else
                    app.Logger.LogError(failure, "HTTP {Method} {Path} failed after {ElapsedMilliseconds} ms",
                        context.Request.Method, context.Request.Path, timer.ElapsedMilliseconds);
            }
        }
    });

    app.UseCors();
    await using (var scope = app.Services.CreateAsyncScope())
    {
        await scope.ServiceProvider.GetRequiredService<ContentDbContext>().Database.EnsureCreatedAsync();
    }

    app.MapGet("/api/health", async (ContentDbContext db, CancellationToken ct) =>
    {
        var available = false;
        try { available = await db.Database.CanConnectAsync(ct); }
        catch { }
        return Results.Json(new { status = available ? "ok" : "unavailable" }, statusCode: available ? 200 : 503);
    });
    app.MapControllers();

    app.Run();
}
catch (Exception exception)
{
    bootstrapLogger.Error(exception, "Content Manager API stopped because of an unhandled exception");
    throw;
}
finally
{
    LogManager.Shutdown();
}
