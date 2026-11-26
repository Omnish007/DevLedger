import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('ProjectDetailSheet uses one accessible Radix Tabs root and a matching active tab panel', () => {
    const source = readFileSync(join(root, 'src/renderer/features/projects/ProjectDetailSheet.tsx'), 'utf8');
    assert.match(source, /<Tabs[\s\S]*?value=\{tab\}[\s\S]*?onValueChange=/);
    assert.match(source, /<TabsContent value=/);
    assert.match(source, /import \{ Tabs, TabsContent, TabsList, TabsTrigger \}/);
});

test('sidebar collapse state is saved through SQLite-backed settings', () => {
    const shell = readFileSync(join(root, 'src/renderer/components/shared/AppShell.tsx'), 'utf8');
    const main = readFileSync(join(root, 'src/renderer/app/App.tsx'), 'utf8');
    const workspace = readFileSync(join(root, 'src/main/services/workspace/dashboard.ts'), 'utf8');
    assert.match(shell, /open=\{sidebarOpen\}[\s\S]*?onOpenChange=\{onSidebarOpenChange\}/);
    assert.match(main, /settings\['sidebarOpen'\] !== false/);
    assert.match(main, /settings\s*\.set\('sidebarOpen', open\)/);
    assert.match(workspace, /setSetting\(key: string, value: unknown\)/);
});

test('sidebar exposes the full nested navigation composition used by the stories', () => {
    const source = readFileSync(join(root, 'src/renderer/components/ui/sidebar.tsx'), 'utf8');
    for (const exportName of [
        'SidebarGroupAction',
        'SidebarMenuAction',
        'SidebarMenuBadge',
        'SidebarMenuSub',
        'SidebarMenuSubItem',
        'SidebarMenuSubButton',
        'SidebarMenuSkeleton',
    ]) {
        assert.ok(source.includes(exportName), `${exportName} should be exported`);
    }
});

test('the control catalogue exercises shared form, feedback and selection primitives', () => {
    const source = readFileSync(
        join(root, 'src/renderer/components/ui/control-catalogue.stories.tsx'),
        'utf8',
    );
    for (const component of [
        'Checkbox',
        'Switch',
        'RadioGroup',
        'Select',
        'NativeSelect',
        'Slider',
        'ToggleGroup',
        'Progress',
        'Skeleton',
        'Spinner',
        'FieldSet',
        'ButtonGroup',
    ]) {
        assert.ok(source.includes(component), `${component} should be represented in the story`);
    }
});

test('feature screens use the shared native select styling instead of ad hoc browser select styles', () => {
    const nativeSelectFiles = [
        'src/renderer/components/shared/LinkConnectionsSection.tsx',
        'src/renderer/features/notes/SmartDateOptionsFooter.tsx',
        'src/renderer/features/projects/ProjectDetailSheet.tsx',
        'src/renderer/features/settings/SettingsGeneralTab.tsx',
        'src/renderer/features/settings/SettingsVaultTab.tsx',
        'src/renderer/features/tasks/TaskFormFields.tsx',
        'src/renderer/features/tasks/TaskEditDialog.tsx',
        'src/renderer/features/tasks/TaskInspectorSheet.tsx',
    ];
    const remotePickerFiles = [
        'src/renderer/features/capture/QuickCapturePage.tsx',
        'src/renderer/features/search/SearchPage.tsx',
        'src/renderer/features/documents/DocumentsPage.tsx',
    ];
    const containerScreens = [
        'src/renderer/components/shared/RecordConnectionsPanel.tsx',
        'src/renderer/features/settings/SettingsPage.tsx',
        'src/renderer/features/tasks/TaskCreateDialog.tsx',
    ];
    for (const file of containerScreens) {
        const source = readFileSync(join(root, file), 'utf8');
        assert.doesNotMatch(source, /<\/?select(?:\s|>)/, `${file} should not use a raw select element`);
    }
    for (const file of [...nativeSelectFiles, ...remotePickerFiles]) {
        const source = readFileSync(join(root, file), 'utf8');
        assert.doesNotMatch(source, /<\/?select(?:\s|>)/, `${file} should not use a raw select element`);
        const expected = remotePickerFiles.includes(file)
            ? /import \{ RemoteRecordPicker \}/
            : /import \{ NativeSelect, NativeSelectOption \}/;
        assert.match(source, expected, `${file} should use a shared selection component`);
    }
});
