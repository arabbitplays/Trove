using Trove.Application.Content;
using Microsoft.AspNetCore.Mvc;

namespace Trove.Api.Controllers;

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

    [HttpGet("tags/overview")]
    public async Task<IActionResult> GetOverview(CancellationToken ct) =>
        Ok(await service.GetSummariesAsync(ct));

    public sealed record RenameTagRequest(string NewName);

    [HttpPut("tags/{tag}/rename")]
    public async Task<IActionResult> Rename(string tag, [FromBody] RenameTagRequest request, CancellationToken ct)
    {
        try
        {
            return await service.RenameAsync(tag, request.NewName, ct) ? NoContent() : NotFound();
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

    [HttpDelete("tags/{tag}/all")]
    public async Task<IActionResult> DeleteTag(string tag, CancellationToken ct)
    {
        try
        {
            return await service.DeleteAsync(tag, ct) ? NoContent() : NotFound();
        }
        catch (ArgumentException error)
        {
            return BadRequest(new { error = error.Message });
        }
    }

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
    public async Task<IActionResult> Remove(string tag, [FromBody] Guid[]? ids, CancellationToken ct)
    {
        try
        {
            if (ids is null || ids.Length == 0)
            {
                return await service.DeleteAsync(tag, ct) ? NoContent() : NotFound();
            }
            await service.RemoveAsync(ids, tag, ct);
            return NoContent();
        }
        catch (ArgumentException error)
        {
            return BadRequest(new { error = error.Message });
        }
    }
}
