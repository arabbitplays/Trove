namespace ImageSorter.Application.Abstractions;

public interface IImageProcessor
{
    Stream ConvertHeicToPng(Stream source);
    byte[] CreateJpegThumbnail(string imagePath, uint maxDimension);
}
