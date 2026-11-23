using ImageMagick;
using Trove.Application.Abstractions;
using System.Globalization;

namespace Trove.Infrastructure.Storage;

public sealed class MagickImageProcessor : IImageProcessor
{
    public DateOnly? GetDateTaken(Stream source)
    {
        if (!source.CanSeek) return null;
        var position = source.Position;
        try
        {
            using var image = new MagickImage(source);
            var profile = image.GetExifProfile();
            var value = profile?.GetValue(ExifTag.DateTimeOriginal)?.Value
                ?? profile?.GetValue(ExifTag.DateTimeDigitized)?.Value
                ?? profile?.GetValue(ExifTag.DateTime)?.Value;
            if (string.IsNullOrWhiteSpace(value)) return null;
            var date = value.Length >= 10 ? value[..10] : value;
            return DateOnly.TryParseExact(date, ["yyyy:MM:dd", "yyyy-MM-dd"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var takenAt)
                ? takenAt
                : null;
        }
        catch (MagickException)
        {
            return null;
        }
        finally
        {
            source.Position = position;
        }
    }

    public Stream ConvertHeicToPng(Stream source)
    {
        try
        {
            using var image = new MagickImage(source);
            image.AutoOrient();
            image.Strip();
            image.Format = MagickFormat.Png;

            var output = new MemoryStream();
            image.Write(output);
            output.Position = 0;
            return output;
        }
        catch (MagickException error)
        {
            throw new IOException("The HEIC image could not be converted to PNG.", error);
        }
    }

    public byte[] CreateJpegThumbnail(string imagePath, uint maxDimension)
    {
        using var image = new MagickImage(imagePath);
        image.AutoOrient();

        var longestSide = Math.Max(image.Width, image.Height);
        if (longestSide > maxDimension)
        {
            var scale = maxDimension / (double)longestSide;
            var width = Math.Max(1u, (uint)Math.Round(image.Width * scale));
            var height = Math.Max(1u, (uint)Math.Round(image.Height * scale));
            image.Resize(width, height);
        }

        image.Strip();
        image.Format = MagickFormat.Jpeg;
        image.Quality = 82;
        using var output = new MemoryStream();
        image.Write(output);
        return output.ToArray();
    }

    public string GetPixelFingerprint(string imagePath)
    {
        try
        {
            using var image = new MagickImage(imagePath);
            image.AutoOrient();
            return $"{image.Width}x{image.Height}:{image.Signature}";
        }
        catch (MagickException error)
        {
            throw new IOException("The image pixels could not be decoded.", error);
        }
    }
}
