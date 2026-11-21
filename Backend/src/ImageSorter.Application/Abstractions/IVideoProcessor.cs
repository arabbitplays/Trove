namespace ImageSorter.Application.Abstractions;

public interface IVideoProcessor
{
    TimeSpan GetDuration(string videoPath);
    byte[] CreateJpegThumbnail(string videoPath, uint maxDimension);
    string GetPixelFingerprint(string videoPath);
}
