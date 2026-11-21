using ImageSorter.Application.Images;
using Microsoft.AspNetCore.Mvc;

namespace ImageSorter.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class TagController(TagService service) : ControllerBase
{
    [HttpGet("tags")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok(await service.ListAsync(ct));

    [HttpPut("tags/{tag}")]
    public async Task<IActionResult> Add(string tag, [FromBody] string[] hashes, CancellationToken ct)
    {
        try
        {
            await service.AddAsync(hashes, tag, ct);
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
    public async Task<IActionResult> Remove(string tag, [FromBody] string[] hashes, CancellationToken ct)
    {
        await service.RemoveAsync(hashes, tag, ct);
        return NoContent();
    }
}
