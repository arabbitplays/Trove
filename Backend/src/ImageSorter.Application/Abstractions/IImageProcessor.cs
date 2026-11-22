namespace ImageSorter.Application.Abstractions;

public interface IImageProcessor
{
    Stream ConvertHeicToPng(Stream source);
    DateOnly? GetDateTaken(Stream source);
    byte[] CreateJpegThumbnail(string imagePath, uint maxDimension);
    string GetPixelFingerprint(string imagePath);
}
