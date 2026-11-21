using ImageSorter.Application.Content;
using Microsoft.AspNetCore.Mvc;

namespace ImageSorter.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class ContentController(ContentService service) : ControllerBase
{
    [HttpGet("contents")]
    public async Task<IActionResult> List([FromQuery] string? tag, [FromQuery] int? skip, [FromQuery] int? take, CancellationToken ct) =>
        Ok(await service.ListAsync(tag, skip ?? 0, take ?? 50, ct));

    [HttpGet("contents/{hash}/thumbnail")]
    public async Task<IActionResult> Thumbnail(string hash, CancellationToken ct)
    {
        var thumbnail = await service.GetThumbnailAsync(hash, ct);
        return thumbnail is null ? NotFound() : File(thumbnail, "image/jpeg");
    }

    [HttpGet("contents/{hash}/content")]
    public async Task<IActionResult> Content(string hash, CancellationToken ct)
    {
        var path = await service.FindContentPathAsync(hash, ct);
        if (path is null) return NotFound();

        var contentType = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".bmp" => "image/bmp",
            ".tif" or ".tiff" => "image/tiff",
            ".avif" => "image/avif",
            ".heic" => "image/heic",
            ".mp4" or ".m4v" => "video/mp4",
            ".mov" => "video/quicktime",
            ".avi" => "video/x-msvideo",
            ".mkv" => "video/x-matroska",
            ".webm" => "video/webm",
            ".mpg" or ".mpeg" => "video/mpeg",
            ".3gp" => "video/3gpp",
            _ => "application/octet-stream"
        };
        return PhysicalFile(path, contentType);
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(CancellationToken ct)
    {
        if (!Request.HasFormContentType) return BadRequest(new { error = "Expected multipart form data." });

        var form = await Request.ReadFormAsync(ct);
        var files = form.Files.Select(file => (file.OpenReadStream(), file.FileName));
        try
        {
            return Ok(await service.ImportAsync(files, ct));
        }
        catch (ArgumentException error)
        {
            return BadRequest(new { error = error.Message });
        }
    }

}
