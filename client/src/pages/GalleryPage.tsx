import { Bot, Database, Folder, ShieldCheck, Table2, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { CopyButton } from "@/components/ui/CopyButton";
import { DocumentTabs } from "@/components/ui/DocumentTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FieldGroup } from "@/components/ui/FieldGroup";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/Kbd";
import { PageHeader } from "@/components/ui/PageHeader";
import { RadioCards } from "@/components/ui/RadioCards";
import { Section } from "@/components/ui/Section";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SettingRow } from "@/components/ui/SettingRow";
import { SettingsGroup } from "@/components/ui/SettingsGroup";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { StatusDot } from "@/components/ui/StatusDot";
import { Switch } from "@/components/ui/Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { Tooltip } from "@/components/ui/Tooltip";
import { TreeView, type TreeNode } from "@/components/ui/TreeView";
import { EnvironmentTag } from "@/features/databases/workbench/EnvironmentTag";
import { useSettings } from "@/platform/hooks";
import { applyTheme } from "@/theme/runtime";
import { builtInThemes } from "@/theme/themes";

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18] as const;
type FontSize = (typeof FONT_SIZES)[number];
type Mode = "light" | "dark";

const TREE: readonly TreeNode[] = [
  {
    id: "public",
    label: "public",
    icon: Folder,
    children: [
      { id: "users", label: "users", icon: Table2 },
      { id: "orders", label: "orders", icon: Table2 },
    ],
  },
  {
    id: "analytics",
    label: "analytics",
    icon: Folder,
    children: [{ id: "events", label: "events", icon: Table2 }],
  },
];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-ui-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </div>
  );
}

export function GalleryPage() {
  const { data: settings } = useSettings();
  const [themeId, setThemeId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [fontSize, setFontSize] = useState<FontSize | null>(null);
  const [radio, setRadio] = useState("a");
  const [tab, setTab] = useState("one");
  const [checked, setChecked] = useState(true);

  // Preview overrides are applied to the document only. They are never written to settings,
  // and the saved settings are re-applied when the page unmounts.
  useEffect(() => {
    if (!settings) return undefined;
    applyTheme({
      ...settings,
      mode: mode ?? settings.theme,
      themeId: themeId ?? settings.themeId,
      fontSize: fontSize ?? settings.fontSize,
    });
    return () => {
      applyTheme({ ...settings, mode: settings.theme });
    };
  }, [settings, themeId, mode, fontSize]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-7">
      <PageHeader
        title="Component gallery"
        description="Development-only visual QA. Preview changes here are not saved."
      />
      <Section
        title="Preview controls"
        description="Override the theme, mode, and font size for this page only."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Theme">
            <Select
              value={themeId ?? settings?.themeId ?? "default"}
              onValueChange={(value) => setThemeId(value)}
            >
              <SelectTrigger className="w-44" aria-label="Theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {builtInThemes.map((theme) => (
                    <SelectItem key={theme.id} value={theme.id}>
                      {theme.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mode">
            <div className="flex gap-1">
              {(["light", "dark"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={(mode ?? settings?.theme) === value ? "default" : "outline"}
                  onClick={() => setMode(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Font size">
            <Select
              value={String(fontSize ?? settings?.fontSize ?? 14)}
              onValueChange={(value) => setFontSize(Number(value) as FontSize)}
            >
              <SelectTrigger className="w-24" aria-label="Font size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {FONT_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}px
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setThemeId(null);
              setMode(null);
              setFontSize(null);
            }}
          >
            Reset preview
          </Button>
        </div>
      </Section>

      <Section title="Foundations">
        <div className="space-y-5">
          <Block title="Button variants">
            {(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map(
              (variant) => (
                <Button key={variant} variant={variant}>
                  {variant}
                </Button>
              ),
            )}
          </Block>
          <Block title="Button sizes">
            {(["xs", "sm", "default", "lg"] as const).map((size) => (
              <Button key={size} size={size}>
                {size}
              </Button>
            ))}
            <Button size="icon" aria-label="Delete">
              <Trash2 />
            </Button>
            <Button disabled>Disabled</Button>
          </Block>
          <Block title="Badge">
            {(["default", "secondary", "outline", "destructive"] as const).map((variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ))}
          </Block>
          <Block title="StatusDot">
            <StatusDot state="healthy" showLabel />
            <StatusDot state="warning" showLabel />
            <StatusDot state="error" showLabel />
            <StatusDot state="neutral" showLabel />
          </Block>
          <Block title="Kbd">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
            <Kbd>Esc</Kbd>
          </Block>
          <Block title="Environment tags">
            {["production", "staging", "development", "local", "reporting"].map((environment) => (
              <EnvironmentTag key={environment} environment={environment} />
            ))}
          </Block>
          <Block title="Trust cues">
            <span className="inline-flex items-center gap-1 rounded border border-success/30 bg-success-subtle px-1.5 py-0.5 text-ui-xs text-success">
              <ShieldCheck className="size-3" />
              Read-only
            </span>
            <span role="img" aria-label="AI access on" className="inline-flex text-success">
              <Bot className="size-3.5" />
            </span>
            <span
              role="img"
              aria-label="AI access off"
              className="inline-flex text-muted-foreground"
            >
              <Bot className="size-3.5" />
            </span>
          </Block>
          <Block title="Spinner">
            <Spinner label="Loading" />
            <Spinner size="sm" label="Loading small" />
          </Block>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup>
            <Field label="Input" description="Helper text">
              <Input placeholder="postgres://localhost" />
            </Field>
            <Field label="Input with error" error="This field is required" required>
              <Input aria-invalid defaultValue="" />
            </Field>
            <Field label="Disabled" optional>
              <Input disabled defaultValue="Read only" />
            </Field>
            <Field label="Textarea">
              <Textarea placeholder="SELECT 1" rows={3} />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field label="Select">
              <Select defaultValue="pg">
                <SelectTrigger className="w-full" aria-label="Engine">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="pg">PostgreSQL</SelectItem>
                    <SelectItem value="my">MySQL</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-ui">
              <Checkbox checked={checked} onCheckedChange={setChecked} />
              Checked
            </label>
            <label className="flex items-center gap-2 text-ui">
              <Checkbox />
              Unchecked
            </label>
            <label className="flex items-center gap-2 text-ui">
              <Checkbox disabled />
              Disabled
            </label>
            <div className="flex items-center gap-4 text-ui">
              <label className="flex items-center gap-2">
                <Switch defaultChecked />
                On
              </label>
              <label className="flex items-center gap-2">
                <Switch />
                Off
              </label>
              <label className="flex items-center gap-2">
                <Switch disabled defaultChecked />
                Disabled on
              </label>
              <label className="flex items-center gap-2">
                <Switch disabled />
                Disabled off
              </label>
            </div>
          </FieldGroup>
        </div>
        <div className="mt-4">
          <RadioCards
            value={radio}
            onChange={setRadio}
            ariaLabel="Example choice"
            options={[
              { value: "a", title: "Option A", description: "First choice" },
              { value: "b", title: "Option B", description: "Second choice" },
            ]}
          />
        </div>
      </Section>

      <Section title="Feedback">
        <div className="space-y-3">
          <Alert>
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>Default alert with a description.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Something failed</AlertTitle>
            <AlertDescription>Destructive alert with a description.</AlertDescription>
          </Alert>
          <Banner variant="info">Info banner</Banner>
          <Banner variant="warning">Warning banner</Banner>
          <Banner variant="danger" dismissible>
            Danger banner (dismissible)
          </Banner>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-16 w-full" />
          </div>
          <EmptyState
            title="Nothing here yet"
            description="Empty state with an action."
            icon={<Database className="size-5" />}
            action={<Button size="sm">Primary action</Button>}
          />
        </div>
      </Section>

      <Section title="Data display">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Card description</CardDescription>
            </CardHeader>
            <CardContent>Card content</CardContent>
          </Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["Production", "PostgreSQL", "healthy"],
                ["Staging", "MySQL", "warning"],
                ["Local", "SQLite", "neutral"],
              ].map(([name, engine, state]) => (
                <TableRow key={name}>
                  <TableCell>{name}</TableCell>
                  <TableCell>{engine}</TableCell>
                  <TableCell>
                    <StatusDot state={state as "healthy" | "warning" | "neutral"} showLabel />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CodeBlock value={"SELECT id, email\nFROM users\nLIMIT 10;"} />
          <SettingsGroup>
            <SettingRow
              title="Setting with switch"
              description="Row description"
              control={<Switch defaultChecked />}
            />
            <SettingRow
              title="Disabled setting"
              description="Disabled row"
              disabled
              control={<Switch disabled />}
            />
          </SettingsGroup>
        </div>
      </Section>

      <Section title="Overlays">
        <Block title="Tooltip">
          <Tooltip content="Tooltip content">
            <Button variant="outline">Hover me</Button>
          </Tooltip>
          <CopyButton value="copied text" label="Copy" />
        </Block>
      </Section>

      <Section title="Navigation">
        <div className="space-y-4">
          <DocumentTabs
            tabs={[
              { id: "one", label: "query-1.sql" },
              { id: "two", label: "users", dirty: true, closable: true },
              { id: "three", label: "orders", closable: true },
            ]}
            activeId={tab}
            onSelect={setTab}
          />
          <div className="max-w-xs rounded-md border border-border">
            <TreeView nodes={TREE} ariaLabel="Schema" />
          </div>
        </div>
      </Section>

      <Section title="Screen states">
        <div className="grid gap-4 md:grid-cols-3">
          <div
            className="space-y-2 rounded-lg border border-border p-3"
            role="status"
            aria-label="Loading example"
          >
            <p className="text-ui-xs font-medium text-muted-foreground">Loading</p>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
          <EmptyState title="No results" description="Empty state example." />
          <Alert variant="destructive">
            <AlertTitle>Could not load data</AlertTitle>
            <AlertDescription>
              Error state example.
              <div className="mt-2">
                <Button size="xs" variant="outline">
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </Section>
    </div>
  );
}
