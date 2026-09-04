import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { format } from "date-fns";
import { formatNgn } from "@/lib/billing/pricing";

const FONTS_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");
const BRAND_DIR = path.join(process.cwd(), "public/brand");

Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONTS_DIR, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONTS_DIR, "Inter-Medium.ttf"), fontWeight: 500 },
    { src: path.join(FONTS_DIR, "Inter-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(FONTS_DIR, "Inter-Bold.ttf"), fontWeight: 700 },
  ],
});
// react-pdf hyphenates by default, which mangles names/URLs mid-word — off.
Font.registerHyphenationCallback((word) => [word]);

const COLORS = {
  brand900: "#022017",
  brand700: "#033322",
  brand600: "#04402c",
  brand500: "#0a5c3f",
  brand100: "#c1dbd0",
  brand50: "#e6f0ec",
  gold500: "#be8c43",
  gold600: "#a3762f",
  gold50: "#faf3e8",
  ink: "#1c211d",
  muted: "#6b6b6b",
  border: "#e7e2d6",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 10,
    color: COLORS.ink,
    paddingBottom: 56,
  },
  header: {
    backgroundColor: COLORS.brand700,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 40,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 22, height: 22 },
  brandWordmark: { color: COLORS.white, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 },
  headerBadge: {
    color: COLORS.gold500,
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: 1,
  },
  meetingTitle: { color: COLORS.white, fontSize: 20, fontWeight: 700, marginBottom: 6 },
  metaRow: { flexDirection: "row", gap: 16 },
  metaItem: { color: "#d7e8de", fontSize: 9 },

  body: { paddingHorizontal: 40, paddingTop: 24 },

  statStrip: { flexDirection: "row", gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.brand50,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statValue: { fontSize: 16, fontWeight: 700, color: COLORS.brand700 },
  statLabel: { fontSize: 8, color: COLORS.muted, marginTop: 2 },

  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.brand700,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  paragraph: { fontSize: 10.5, lineHeight: 1.6, color: COLORS.ink },

  bulletRow: { flexDirection: "row", marginBottom: 6, paddingRight: 8 },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.gold500,
    marginTop: 4,
    marginRight: 8,
  },
  bulletText: { fontSize: 10.5, lineHeight: 1.5, color: COLORS.ink, flex: 1 },

  table: { borderTopWidth: 1, borderTopColor: COLORS.border },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
    alignItems: "flex-start",
  },
  tableRowDone: { backgroundColor: COLORS.brand50 },
  checkbox: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: COLORS.gold500,
    marginRight: 8,
    marginTop: 1,
  },
  checkboxDone: { backgroundColor: COLORS.gold500 },
  taskText: { fontSize: 10, flex: 1, lineHeight: 1.4 },
  taskTextDone: { color: COLORS.muted, textDecoration: "line-through" },
  taskMeta: { fontSize: 8.5, color: COLORS.muted, width: 110, textAlign: "right" },

  reminderRow: { flexDirection: "row", marginBottom: 6 },
  reminderDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.brand500,
    marginTop: 4,
    marginRight: 8,
  },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: COLORS.muted },
  emptyState: { fontSize: 10, color: COLORS.muted, fontStyle: "italic" },
});

interface MeetingReportProps {
  meeting: {
    title: string;
    startedAt: Date | null;
    durationSeconds: number | null;
    participantCount: number | null;
    executiveSummary: string | null;
  };
  keyInsights: { id: string; content: string }[];
  recommendations: { text: string; rationale: string | null }[];
  decisions: { decision: string; context: string; owner: string | null; implications: string | null }[];
  risks: { description: string; severity: "low" | "medium" | "high"; wasExplicit: boolean }[];
  openQuestions: string[];
  actionItems: {
    id: string;
    text: string;
    assignee: string | null;
    dueDate: Date | null;
    completed: boolean;
  }[];
  reminders: { id: string; text: string; triggerAt: Date | null }[];
  participants: { id: string; displayName: string | null; speakerLabel: string }[];
  chargeKobo: number | null;
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function MeetingReport({
  meeting,
  keyInsights,
  recommendations,
  decisions,
  risks,
  openQuestions,
  actionItems,
  reminders,
  participants,
  chargeKobo,
}: MeetingReportProps) {
  const logoBuffer = readFileSync(path.join(BRAND_DIR, "hiva-icon-192.png"));
  const durationMin = meeting.durationSeconds ? Math.round(meeting.durationSeconds / 60) : null;
  const completedCount = actionItems.filter((a) => a.completed).length;

  return (
    <Document
      title={`${meeting.title} — Hivameet report`}
      author="Hivameet"
      creator="Hivameet"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.brandRow}>
              <Image src={logoBuffer} style={styles.logo} />
              <Text style={styles.brandWordmark}>HIVAMEET</Text>
            </View>
            <Text style={styles.headerBadge}>MEETING REPORT</Text>
          </View>
          <Text style={styles.meetingTitle}>{meeting.title}</Text>
          <View style={styles.metaRow}>
            {meeting.startedAt && (
              <Text style={styles.metaItem}>
                {format(meeting.startedAt, "EEEE, MMMM d, yyyy · h:mm a")}
              </Text>
            )}
            {durationMin !== null && <Text style={styles.metaItem}>{durationMin} min</Text>}
            {participants.length > 0 && (
              <Text style={styles.metaItem}>
                {participants.length} participant{participants.length === 1 ? "" : "s"}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.statStrip}>
            <StatCard value={durationMin !== null ? `${durationMin}` : "—"} label="Minutes recorded" />
            <StatCard value={String(keyInsights.length)} label="Key insights" />
            <StatCard
              value={`${completedCount}/${actionItems.length}`}
              label="Action items done"
            />
            <StatCard
              value={chargeKobo !== null ? formatNgn(chargeKobo) : "—"}
              label="Meeting cost"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            {meeting.executiveSummary ? (
              <Text style={styles.paragraph}>{meeting.executiveSummary}</Text>
            ) : (
              <Text style={styles.emptyState}>No summary generated for this meeting.</Text>
            )}
          </View>

          {keyInsights.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Key Insights</Text>
              {keyInsights.map((i) => (
                <View key={i.id} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{i.content}</Text>
                </View>
              ))}
            </View>
          )}

          {decisions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Decisions Made</Text>
              {decisions.map((d, i) => (
                <View key={i} style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: 600 }}>{d.decision}</Text>
                  <Text style={{ fontSize: 9.5, color: COLORS.muted, marginTop: 1 }}>{d.context}</Text>
                </View>
              ))}
            </View>
          )}

          {risks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Risks &amp; Concerns</Text>
              {risks.map((r, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>
                    [{r.severity}] {r.description}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {openQuestions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Open Questions</Text>
              {openQuestions.map((q, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{q}</Text>
                </View>
              ))}
            </View>
          )}

          {recommendations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI Recommendations</Text>
              {recommendations.map((r, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{r.text}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Next Steps &amp; Action Items</Text>
            {actionItems.length === 0 ? (
              <Text style={styles.emptyState}>No action items were extracted.</Text>
            ) : (
              <View style={styles.table}>
                {actionItems.map((a) => (
                  <View
                    key={a.id}
                    style={a.completed ? [styles.tableRow, styles.tableRowDone] : styles.tableRow}
                  >
                    <View style={a.completed ? [styles.checkbox, styles.checkboxDone] : styles.checkbox} />
                    <Text style={a.completed ? [styles.taskText, styles.taskTextDone] : styles.taskText}>
                      {a.text}
                    </Text>
                    <Text style={styles.taskMeta}>
                      {[a.assignee, a.dueDate ? format(a.dueDate, "MMM d") : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {reminders.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reminders</Text>
              {reminders.map((r) => (
                <View key={r.id} style={styles.reminderRow}>
                  <View style={styles.reminderDot} />
                  <Text style={styles.bulletText}>
                    {r.text}
                    {r.triggerAt ? `  ·  ${format(r.triggerAt, "EEE, MMM d")}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Generated by Hivameet · {format(new Date(), "MMM d, yyyy 'at' h:mm a")}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
