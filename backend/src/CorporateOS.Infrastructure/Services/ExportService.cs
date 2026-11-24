using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Domain.Localization;

namespace CorporateOS.Infrastructure.Services;

public sealed class ExportService(TimeProvider clock) : IExportService
{
    public ExportFile ToCsv(ReportTable table)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', table.Columns.Select(Escape)));
        foreach (var row in table.Rows)
        {
            builder.AppendLine(string.Join(',', row.Select(value => Escape(Format(value)))));
        }

        // UTF-8 BOM so Excel opens non-ASCII names correctly.
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(builder.ToString())).ToArray();
        return new ExportFile(bytes, "text/csv", FileName(table.Title, "csv"));
    }

    public ExportFile ToExcel(ReportTable table)
    {
        using var workbook = new XLWorkbook();
        var sheetName = new string(table.Title.Where(c => !"[]*?/\\:".Contains(c)).Take(31).ToArray());
        var sheet = workbook.Worksheets.Add(string.IsNullOrWhiteSpace(sheetName) ? Text.Get("report.sheet") : sheetName);

        for (var col = 0; col < table.Columns.Count; col++)
        {
            sheet.Cell(1, col + 1).Value = table.Columns[col];
        }

        for (var row = 0; row < table.Rows.Count; row++)
        {
            for (var col = 0; col < table.Rows[row].Count; col++)
            {
                var cell = sheet.Cell(row + 2, col + 1);
                switch (table.Rows[row][col])
                {
                    case null: break;
                    case decimal d: cell.Value = d; cell.Style.NumberFormat.Format = "#,##0.00"; break;
                    case int i: cell.Value = i; break;
                    case long l: cell.Value = l; break;
                    case double db: cell.Value = db; break;
                    case DateOnly date: cell.Value = date.ToDateTime(TimeOnly.MinValue); cell.Style.DateFormat.Format = "yyyy-mm-dd"; break;
                    case DateTime dt: cell.Value = dt; cell.Style.DateFormat.Format = "yyyy-mm-dd hh:mm"; break;
                    case bool b: cell.Value = Text.Get(b ? "common.yes" : "common.no"); break;
                    case var other: cell.Value = other.ToString(); break;
                }
            }
        }

        var header = sheet.Range(1, 1, 1, Math.Max(1, table.Columns.Count));
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = XLColor.FromHtml("#F3F4F6");
        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(table.Rows.Count + 1, 200));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return new ExportFile(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            FileName(table.Title, "xlsx"));
    }

    private string FileName(string title, string extension)
    {
        var slug = new string(title.ToLowerInvariant().Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray()).Trim('-');
        return $"{slug}-{clock.GetUtcNow():yyyyMMdd-HHmm}.{extension}";
    }

    private static string Format(object? value) => value switch
    {
        null => string.Empty,
        decimal d => d.ToString("0.00", CultureInfo.InvariantCulture),
        DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        DateTime dt => dt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
        bool b => Text.Get(b ? "common.yes" : "common.no"),
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty
    };

    /// <summary>Quotes fields and neutralises spreadsheet formula injection (=, +, -, @).</summary>
    private static string Escape(string value)
    {
        if (value.Length > 0 && "=+-@".Contains(value[0]) && !decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out _))
        {
            value = "'" + value;
        }

        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }
}
