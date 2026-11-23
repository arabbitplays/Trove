using Microsoft.AspNetCore.Mvc;
using Trove.Application.Content;

namespace Trove.Api.Controllers;

[ApiController]
[Route("api/garbage")]
public sealed class GarbageController(GarbageService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok(await service.ListAsync(ct));

    [HttpPost("{id:guid}/restore")]
    public async Task<IActionResult> Restore(Guid id, CancellationToken ct) =>
        await service.RestoreAsync(id, ct) ? NoContent() : NotFound();
}
