using ImageSorter.Application.Content;
using Microsoft.AspNetCore.Mvc;

namespace ImageSorter.Api.Controllers;

[ApiController]
[Route("api/periods")]
public sealed class PeriodController(PeriodService service) : ControllerBase
{
    public sealed record CreatePeriodRequest(string Name, DateOnly StartDate, DateOnly EndDate, string[]? ContentHashes);
    public sealed record UpdatePeriodRequest(string Name, DateOnly StartDate, DateOnly EndDate, string? TitleImageHash);
    public sealed record AddPeriodContentsRequest(string[]? Hashes, string[]? Tags, bool AllMatching, string[]? ExcludedHashes);

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await service.ListAsync(ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var period = await service.GetAsync(id, ct);
        return period is null ? NotFound() : Ok(period);
    }

    [HttpGet("{id:guid}/contents")]
    public async Task<IActionResult> GetContents(Guid id, CancellationToken ct)
    {
        var contents = await service.GetContentsAsync(id, ct);
        return contents is null ? NotFound() : Ok(contents);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePeriodRequest request, CancellationToken ct)
    {
        try
        {
            var period = await service.CreateAsync(request.Name, request.StartDate, request.EndDate, request.ContentHashes, ct);
            return CreatedAtAction(nameof(Get), new { id = period.Id }, period);
        }
        catch (KeyNotFoundException error) { return NotFound(new { error = error.Message }); }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePeriodRequest request, CancellationToken ct)
    {
        try
        {
            return await service.UpdateAsync(id, request.Name, request.StartDate, request.EndDate, request.TitleImageHash, ct)
                ? NoContent()
                : NotFound();
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpPost("{id:guid}/contents")]
    public async Task<IActionResult> AddContents(Guid id, [FromBody] AddPeriodContentsRequest request, CancellationToken ct)
    {
        try
        {
            return await service.AddContentsAsync(id, request.Hashes, request.Tags, request.AllMatching, request.ExcludedHashes, ct)
                ? NoContent()
                : NotFound();
        }
        catch (KeyNotFoundException error) { return NotFound(new { error = error.Message }); }
    }

    [HttpDelete("{id:guid}/contents/{hash}")]
    public async Task<IActionResult> RemoveContent(Guid id, string hash, CancellationToken ct) =>
        await service.RemoveContentAsync(id, hash, ct) ? NoContent() : NotFound();
}
