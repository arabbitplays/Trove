using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using ImageSorter.Application.Abstractions;

namespace ImageSorter.Infrastructure.Storage;

public sealed class FfmpegVideoProcessor : IVideoProcessor
{
    public TimeSpan GetDuration(string videoPath)
    {
        var result = Run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath]);
        if (!double.TryParse(result.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) || !double.IsFinite(seconds) || seconds < 0)
            throw new IOException("The video duration could not be read.");
        return TimeSpan.FromSeconds(seconds);
    }

    public byte[] CreateJpegThumbnail(string videoPath, uint maxDimension)
    {
        var result = RunBytes("ffmpeg", ["-v", "error", "-i", videoPath, "-frames:v", "1", "-vf", $"scale='min({maxDimension},iw)':-2", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"]);
        if (result.Length == 0) throw new IOException("A thumbnail could not be decoded from the video.");
        return result;
    }

    public string GetPixelFingerprint(string videoPath)
    {
        var dimensions = Run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", videoPath]).Trim();
        if (string.IsNullOrWhiteSpace(dimensions)) throw new IOException("The video dimensions could not be read.");
        var pixelHash = RunHash("ffmpeg", ["-v", "error", "-i", videoPath, "-map", "0:v:0", "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
        return $"{dimensions}:{pixelHash}";
    }

    private static string Run(string program, IReadOnlyList<string> args)
    {
        var bytes = RunBytes(program, args);
        return System.Text.Encoding.UTF8.GetString(bytes);
    }

    private static byte[] RunBytes(string program, IReadOnlyList<string> args)
    {
        using var process = Start(program, args);
        using var output = new MemoryStream();
        var errorTask = process.StandardError.ReadToEndAsync();
        process.StandardOutput.BaseStream.CopyTo(output);
        process.WaitForExit();
        var error = errorTask.GetAwaiter().GetResult();
        if (process.ExitCode != 0)
            throw new IOException($"{program} could not process the video: {error.Trim()}");
        return output.ToArray();
    }

    private static string RunHash(string program, IReadOnlyList<string> args)
    {
        using var process = Start(program, args);
        var errorTask = process.StandardError.ReadToEndAsync();
        var hash = SHA256.HashData(process.StandardOutput.BaseStream);
        process.WaitForExit();
        var error = errorTask.GetAwaiter().GetResult();
        if (process.ExitCode != 0)
            throw new IOException($"{program} could not decode video frames: {error.Trim()}");
        return Convert.ToHexString(hash);
    }

    private static Process Start(string program, IReadOnlyList<string> args)
    {
        var start = new ProcessStartInfo(program)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        foreach (var arg in args) start.ArgumentList.Add(arg);
        try
        {
            return Process.Start(start) ?? throw new IOException($"Could not start {program}.");
        }
        catch (System.ComponentModel.Win32Exception error)
        {
            throw new IOException($"{program} is required to process video files.", error);
        }
    }
}
