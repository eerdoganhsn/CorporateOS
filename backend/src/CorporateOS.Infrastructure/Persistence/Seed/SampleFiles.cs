using System.Globalization;
using System.Text;

namespace CorporateOS.Infrastructure.Persistence.Seed;

/// <summary>Generates small, valid sample files so seeded documents can actually be downloaded.</summary>
internal static class SampleFiles
{
    /// <summary>Builds a minimal single-page PDF containing the given lines of text.</summary>
    public static byte[] Pdf(string title, IReadOnlyList<string> lines)
    {
        static string Escape(string s) => s.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");

        var content = new StringBuilder();
        content.Append("BT /F1 18 Tf 72 740 Td (").Append(Escape(title)).Append(") Tj ET\n");
        var y = 710;
        foreach (var line in lines)
        {
            content.Append(CultureInfo.InvariantCulture, $"BT /F1 11 Tf 72 {y} Td (").Append(Escape(line)).Append(") Tj ET\n");
            y -= 18;
        }

        var stream = content.ToString();
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            $"<< /Length {Encoding.ASCII.GetByteCount(stream)} >>\nstream\n{stream}endstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };

        var pdf = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int>();
        for (var i = 0; i < objects.Length; i++)
        {
            offsets.Add(Encoding.ASCII.GetByteCount(pdf.ToString()));
            pdf.Append(CultureInfo.InvariantCulture, $"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
        }

        var xref = Encoding.ASCII.GetByteCount(pdf.ToString());
        pdf.Append(CultureInfo.InvariantCulture, $"xref\n0 {objects.Length + 1}\n0000000000 65535 f \n");
        foreach (var offset in offsets)
        {
            pdf.Append(CultureInfo.InvariantCulture, $"{offset:D10} 00000 n \n");
        }

        pdf.Append(CultureInfo.InvariantCulture, $"trailer\n<< /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(pdf.ToString());
    }

    public static byte[] Text(string content) => Encoding.UTF8.GetBytes(content);
}
