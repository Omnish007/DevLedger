import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, FolderKanban, FolderOpen, Plus, Settings2 } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from './sidebar';

const meta = {
  title: 'Navigation/Sidebar',
  component: SidebarProvider,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SidebarProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WorkspaceNavigation: Story = {
  render: () => (
    <div className="h-[34rem] overflow-hidden rounded-lg border border-border">
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <strong className="px-2 text-sm">DevLedger</strong>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupAction aria-label="Add workspace item" title="Add workspace item">
                <Plus />
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <FolderKanban />
                      <span>Projects</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>12</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>
                      <FileText />
                      <span>Documents</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction aria-label="Document options" title="Document options">
                      <Settings2 />
                    </SidebarMenuAction>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton isActive>
                          <FolderOpen />
                          Scope documents
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton>Technical specifications</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Loading example</SidebarGroupLabel>
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton />
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarTrigger />
          </SidebarFooter>
        </Sidebar>
        <main className="min-w-0 flex-1 p-6 text-sm text-muted-foreground">
          Resize the window or collapse the sidebar to inspect the navigation states.
        </main>
      </SidebarProvider>
    </div>
  ),
};
