import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, Copy, MoreHorizontal, PanelRight, Settings2 } from 'lucide-react';
import { Badge } from './badge';
import { Button } from './button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarTrigger } from './menubar';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from './popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const meta = {
  title: 'Foundations/Overlays and Navigation',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverlayCatalogue: Story = {
  render: () => (
    <TooltipProvider>
      <div className="space-y-8">
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Application menus</h2>
            <p className="text-sm text-muted-foreground">Compact, keyboard-accessible menu actions for desktop workflows.</p>
          </div>
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>New note</MenubarItem>
                <MenubarItem>New project</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>Export workspace</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>View</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>Focus mode</MenubarItem>
                <MenubarItem>Show activity</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Dialog</h3>
            <Dialog>
              <DialogTrigger asChild><Button variant="outline">Open dialog</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Project details</DialogTitle>
                  <DialogDescription>A focused modal for short, deliberate tasks.</DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">Use dialogs for focused forms and decisions that should temporarily interrupt the current workflow.</p>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Sheet</h3>
            <Sheet>
              <SheetTrigger asChild><Button variant="outline"><PanelRight className="mr-2 size-4"/>Open details</Button></SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>Record details</SheetTitle>
                  <SheetDescription>Secondary information without leaving the current screen.</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><Badge>In progress</Badge></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Updated</span><span>Today</span></div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Drawer</h3>
            <Drawer>
              <DrawerTrigger asChild><Button variant="outline">Open quick panel</Button></DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Quick actions</DrawerTitle>
                  <DrawerDescription>A compact, mobile-width interaction surface.</DrawerDescription>
                </DrawerHeader>
                <DrawerFooter><Button>Continue</Button></DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Popover</h3>
            <Popover>
              <PopoverTrigger asChild><Button variant="outline"><CalendarDays className="mr-2 size-4"/>Schedule</Button></PopoverTrigger>
              <PopoverContent align="start">
                <PopoverHeader>
                  <PopoverTitle>Follow-up date</PopoverTitle>
                  <PopoverDescription>Choose a date or enter a smart date expression.</PopoverDescription>
                </PopoverHeader>
                <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">Friday · 09:00</p>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Hover card</h3>
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild><Button variant="link" className="h-auto px-0">@Alex Morgan</Button></HoverCardTrigger>
              <HoverCardContent align="start">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Alex Morgan</p>
                  <p className="text-sm text-muted-foreground">Technical project manager</p>
                  <p className="text-xs text-muted-foreground">alex@example.local</p>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Tooltip</h3>
            <Tooltip>
              <TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal className="size-4"/></Button></TooltipTrigger>
              <TooltipContent>More record actions</TooltipContent>
            </Tooltip>
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-4 sm:col-span-2 xl:col-span-3">
            <h3 className="text-sm font-semibold">Context menu</h3>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button className="flex min-h-24 w-full items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
                  Right-click this record row to open its contextual actions
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuLabel>Project record</ContextMenuLabel>
                <ContextMenuItem><Copy className="mr-2 size-4"/>Copy link</ContextMenuItem>
                <ContextMenuItem><Settings2 className="mr-2 size-4"/>Open settings</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className="text-destructive">Move to trash</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </section>
      </div>
    </TooltipProvider>
  ),
};
