using ImageSorter.Application.Content;
using Microsoft.AspNetCore.Mvc;

namespace ImageSorter.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class TagController(TagService service, ContentService contentService) : ControllerBase
{
    public sealed record TagListResponse(IReadOnlyList<string> Tags, IReadOnlyList<string> AutoTags, IReadOnlyList<string> AvailableTags);

    [HttpGet("tags")]
    public async Task<IActionResult> List([FromQuery] string[]? tag, CancellationToken ct) =>
        Ok(new TagListResponse(
            await service.ListAsync(ct),
            await service.ListAutoAsync(ct),
            await contentService.GetAvailableTagsAsync(tag, ct)));

    [HttpPut("tags/{tag}")]
    public async Task<IActionResult> Add(string tag, [FromBody] Guid[] ids, CancellationToken ct)
    {
        try
        {
            await service.AddAsync(ids, tag, ct);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (ArgumentException error)
        {
            return BadRequest(new { error = error.Message });
        }
    }

    [HttpDelete("tags/{tag}")]
    public async Task<IActionResult> Remove(string tag, [FromBody] Guid[] ids, CancellationToken ct)
    {
        try
        {
            await service.RemoveAsync(ids, tag, ct);
            return NoContent();
        }
        catch (ArgumentException error)
        {
            return BadRequest(new { error = error.Message });
        }
    }
}
