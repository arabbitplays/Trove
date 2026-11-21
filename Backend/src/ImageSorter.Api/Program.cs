using ImageSorter.Application.Abstractions;
using ImageSorter.Application.Images;
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
    var connectionString = builder.Configuration.GetConnectionString("Images")
        ?? "Host=localhost;Port=5432;Database=imagemanager;Username=imagemanager;Password=imagemanager";
    var imagePath = builder.Configuration["ImageStorage:Path"]
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Resources", "Images");

    builder.Services.AddDbContext<ImageDbContext>(options => options
        .UseNpgsql(connectionString)
        .ConfigureWarnings(warnings => warnings.Log((RelationalEventId.CommandExecuted, Microsoft.Extensions.Logging.LogLevel.Trace))));
    builder.Services.AddScoped<IImageCatalog, EfImageCatalog>();
    builder.Services.AddSingleton<IImageStorage>(_ => new LocalImageStorage(imagePath));
    builder.Services.AddSingleton<IImageProcessor, MagickImageProcessor>();
    builder.Services.AddSingleton<IClock, SystemClock>();
    builder.Services.AddScoped<ImageService>();
    builder.Services.AddScoped<TagService>();
    builder.Services.AddControllers();
    var allowedOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"];
    builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));
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
            if (failure is null)
                app.Logger.LogInformation("HTTP {Method} {Path} returned {StatusCode} in {ElapsedMilliseconds} ms",
                    context.Request.Method, context.Request.Path, context.Response.StatusCode, timer.ElapsedMilliseconds);
            else
                app.Logger.LogError(failure, "HTTP {Method} {Path} failed after {ElapsedMilliseconds} ms",
                    context.Request.Method, context.Request.Path, timer.ElapsedMilliseconds);
        }
    });

    app.UseCors();
    await using (var scope = app.Services.CreateAsyncScope())
        await scope.ServiceProvider.GetRequiredService<ImageDbContext>().Database.EnsureCreatedAsync();

    app.MapGet("/api/health", async (ImageDbContext db, CancellationToken ct) =>
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
    bootstrapLogger.Error(exception, "Image Manager API stopped because of an unhandled exception");
    throw;
}
finally
{
    LogManager.Shutdown();
}
