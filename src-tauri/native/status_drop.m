#import <AppKit/AppKit.h>
#import <objc/runtime.h>

// 兼容工程声明的 macOS 10.13；新系统使用用户强调色和系统分隔线。
static NSColor *GoPicAccentColor(void) {
    if (@available(macOS 10.14, *)) return NSColor.controlAccentColor;
    return NSColor.systemBlueColor;
}
static NSColor *GoPicSeparatorColor(void) {
    if (@available(macOS 10.14, *)) return NSColor.separatorColor;
    return NSColor.gridColor;
}

// 与 Flutter StatusBarController 保持相同交互；只把文件路径交给 Rust，不在 Cocoa 上传。
typedef void (*GoPicDropCallback)(const char *json);
typedef void (*GoPicMenuCallback)(int action);
@interface GoPicDropView : NSView <NSDraggingDestination> {
@public
    GoPicDropCallback onDrop;
    GoPicMenuCallback onMenu;
    BOOL panelView;
}
@property(nonatomic, weak) NSStatusBarButton *statusButton;
@property(nonatomic, strong) NSPanel *dropPanel;
@property(nonatomic, weak) GoPicDropView *owner;
@property(nonatomic, strong) NSImage *idleIcon;
@property(nonatomic, copy) NSString *state;
@property(nonatomic, copy) NSString *statusTooltip;
@property(nonatomic) BOOL active;
@property(nonatomic, strong) NSMenu *statusMenu;
@property(nonatomic, strong) NSMenuItem *latestItem;
@end

@implementation GoPicDropView
- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) { [self registerForDraggedTypes:@[NSPasteboardTypeFileURL]]; _state = @"idle"; }
    return self;
}
- (NSArray<NSString *> *)paths:(id<NSDraggingInfo>)sender {
    NSArray<NSURL *> *urls = [[sender draggingPasteboard] readObjectsForClasses:@[[NSURL class]] options:@{NSPasteboardURLReadingFileURLsOnlyKey:@YES}];
    NSMutableArray *paths = [NSMutableArray array];
    for (NSURL *url in urls) {
        BOOL directory = NO;
        if ([[NSFileManager defaultManager] fileExistsAtPath:url.path isDirectory:&directory] && !directory) [paths addObject:url.path];
    }
    return paths; // 用户已扩展范围：无扩展名和非图片文件也允许拖入。
}
- (NSImage *)feedbackIcon:(NSString *)state {
    if ([state isEqualToString:@"idle"] && self.idleIcon) return self.idleIcon;
    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(18,18)];
    [image lockFocus];
    BOOL success = [state isEqualToString:@"success"];
    BOOL error = [state isEqualToString:@"error"];
    NSColor *color = success ? NSColor.systemGreenColor : error ? NSColor.systemRedColor : GoPicAccentColor();
    [color setFill]; [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(1.5,1.5,15,15)] fill];
    NSBezierPath *mark = [NSBezierPath bezierPath];
    mark.lineWidth = 1.8; mark.lineCapStyle = NSLineCapStyleRound; mark.lineJoinStyle = NSLineJoinStyleRound;
    if (success) { [mark moveToPoint:NSMakePoint(5.5,9)];[mark lineToPoint:NSMakePoint(8,6)];[mark lineToPoint:NSMakePoint(12.5,11.5)]; }
    else if (error) { [mark moveToPoint:NSMakePoint(6.5,6.5)];[mark lineToPoint:NSMakePoint(11.5,11.5)];[mark moveToPoint:NSMakePoint(11.5,6.5)];[mark lineToPoint:NSMakePoint(6.5,11.5)]; }
    else { [mark moveToPoint:NSMakePoint(9,5)];[mark lineToPoint:NSMakePoint(9,13)];[mark moveToPoint:NSMakePoint(5.5,9)];[mark lineToPoint:NSMakePoint(9,13)];[mark lineToPoint:NSMakePoint(12.5,9)]; }
    [NSColor.whiteColor setStroke];[mark stroke];[image unlockFocus];image.template = NO;return image;
}
- (void)refreshIcon {
    self.statusButton.image = [self feedbackIcon:self.active ? @"uploading" : self.state];
    self.statusButton.toolTip = self.active ? @"松开以上传到 GoPic" : self.statusTooltip;
}
- (void)setDragActive:(BOOL)active {
    GoPicDropView *root = self.owner ?: self;
    root.active = active;[root refreshIcon];
    if (panelView) { self.active = active; self.needsDisplay = YES; }
}
- (void)showDropPanel {
    if (panelView || !self.window) return;
    [self cancelHide];
    if (!self.dropPanel) {
        NSPanel *panel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0,0,280,132) styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
        panel.floatingPanel = YES; panel.level = NSStatusWindowLevel;
        panel.hidesOnDeactivate = NO; panel.hasShadow = YES;panel.opaque = NO;panel.backgroundColor = NSColor.clearColor;
        panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorTransient | NSWindowCollectionBehaviorIgnoresCycle;
        GoPicDropView *view = [[GoPicDropView alloc] initWithFrame:NSMakeRect(0,0,280,132)];
        view->onDrop = onDrop;view->panelView = YES;view.owner = self;
        panel.contentView = view;self.dropPanel = panel;
    }
    NSRect button = [self.window convertRectToScreen:[self convertRect:self.bounds toView:nil]];
    NSRect screen = (self.window.screen ?: NSScreen.mainScreen).visibleFrame;
    NSSize size = self.dropPanel.frame.size;
    NSPoint origin = NSMakePoint(NSMidX(button)-size.width/2,NSMinY(button)-size.height-8);
    origin.x = MIN(MAX(origin.x,NSMinX(screen)+8),NSMaxX(screen)-size.width-8);
    origin.y = MAX(origin.y,NSMinY(screen)+8);
    [self.dropPanel setFrame:NSMakeRect(origin.x,origin.y,size.width,size.height) display:YES];
    GoPicDropView *view = (GoPicDropView *)self.dropPanel.contentView;view.active = NO;view.needsDisplay = YES;
    [self.dropPanel orderFrontRegardless];
}
- (void)cancelHide { [NSObject cancelPreviousPerformRequestsWithTarget:self selector:@selector(hideDropPanel) object:nil]; }
- (void)hideDropPanel {
    [self cancelHide];[self.dropPanel orderOut:nil];
    GoPicDropView *view = (GoPicDropView *)self.dropPanel.contentView;view.active = NO;view.needsDisplay = YES;
    self.active = NO;[self refreshIcon];
}
- (NSDragOperation)draggingEntered:(id<NSDraggingInfo>)sender {
    if (![self paths:sender].count) return NSDragOperationNone;
    GoPicDropView *root = self.owner ?: self;[root cancelHide];
    if (!panelView) [self showDropPanel];[self setDragActive:YES];return NSDragOperationCopy;
}
- (NSDragOperation)draggingUpdated:(id<NSDraggingInfo>)sender { return [self paths:sender].count ? NSDragOperationCopy : NSDragOperationNone; }
- (void)draggingExited:(id<NSDraggingInfo>)sender {
    [self setDragActive:NO];GoPicDropView *root = self.owner ?: self;
    [root cancelHide];[root performSelector:@selector(hideDropPanel) withObject:nil afterDelay:0.45];
}
- (BOOL)prepareForDragOperation:(id<NSDraggingInfo>)sender { return [self paths:sender].count > 0; }
- (BOOL)performDragOperation:(id<NSDraggingInfo>)sender {
    NSArray *paths = [self paths:sender];if (!paths.count || !onDrop) return NO;
    GoPicDropView *root = self.owner ?: self;[root hideDropPanel];
    NSData *data = [NSJSONSerialization dataWithJSONObject:paths options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (!json) return NO;onDrop(json.UTF8String);return YES;
}
- (void)concludeDragOperation:(id<NSDraggingInfo>)sender { [(self.owner ?: self) hideDropPanel]; }
// 与 Flutter 一致在抬起时打开菜单，不把 mouseDown 转发回被覆盖的按钮。
- (void)mouseDown:(NSEvent *)event {}
- (void)rightMouseDown:(NSEvent *)event {}
// 直接弹出 Cocoa 菜单，不在 tracking loop 内持有 tray-icon 的 RefCell 借用。
- (void)showMenu { if (!panelView) [self.statusMenu popUpMenuPositioningItem:nil atLocation:NSMakePoint(0,self.statusButton.bounds.size.height) inView:self.statusButton]; }
- (void)menuAction:(NSMenuItem *)item { if (onMenu) onMenu((int)item.tag); }
- (void)mouseUp:(NSEvent *)event { [self showMenu]; }
- (void)rightMouseUp:(NSEvent *)event { [self showMenu]; }
- (void)drawRect:(NSRect)dirtyRect {
    if (!panelView) return;
    [super drawRect:dirtyRect];
    NSBezierPath *background = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(self.bounds,1,1) xRadius:14 yRadius:14];
    [(self.active ? [GoPicAccentColor() colorWithAlphaComponent:0.16] : [NSColor.windowBackgroundColor colorWithAlphaComponent:0.96]) setFill];[background fill];
    [(self.active ? GoPicAccentColor() : GoPicSeparatorColor()) setStroke];background.lineWidth = self.active ? 2 : 1;[background stroke];
    NSRect glyph = NSMakeRect(22,40,50,50);
    [[GoPicAccentColor() colorWithAlphaComponent:0.15] setFill];[[NSBezierPath bezierPathWithRoundedRect:glyph xRadius:12 yRadius:12] fill];
    NSBezierPath *arrow = [NSBezierPath bezierPath];
    [arrow moveToPoint:NSMakePoint(47,77)];[arrow lineToPoint:NSMakePoint(38,66)];
    [arrow moveToPoint:NSMakePoint(47,77)];[arrow lineToPoint:NSMakePoint(56,66)];
    [arrow moveToPoint:NSMakePoint(47,77)];[arrow lineToPoint:NSMakePoint(47,54)];
    [arrow moveToPoint:NSMakePoint(35,51)];[arrow lineToPoint:NSMakePoint(59,51)];
    arrow.lineWidth = 2.4;arrow.lineCapStyle = NSLineCapStyleRound;arrow.lineJoinStyle = NSLineJoinStyleRound;
    [GoPicAccentColor() setStroke];[arrow stroke];
    NSDictionary *title = @{NSFontAttributeName:[NSFont systemFontOfSize:16 weight:NSFontWeightSemibold],NSForegroundColorAttributeName:NSColor.labelColor};
    NSDictionary *subtitle = @{NSFontAttributeName:[NSFont systemFontOfSize:12],NSForegroundColorAttributeName:NSColor.secondaryLabelColor};
    [(self.active ? @"松开以上传" : @"拖到这里上传") drawInRect:NSMakeRect(88,70,170,22) withAttributes:title];
    [@"GoPic 会上传文件并复制链接" drawInRect:NSMakeRect(88,46,178,18) withAttributes:subtitle];
}
@end

void gopic_install_status_drop(void *rawStatusItem, GoPicDropCallback onDrop, GoPicMenuCallback onMenu) {
    NSStatusItem *item = (__bridge NSStatusItem *)rawStatusItem;NSStatusBarButton *button = item.button;if (!button) return;
    GoPicDropView *old = objc_getAssociatedObject(item,@selector(gopicDropView));[old hideDropPanel];[old removeFromSuperview];
    GoPicDropView *view = [[GoPicDropView alloc] initWithFrame:button.bounds];
    view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;view->onDrop = onDrop;view->onMenu = onMenu;view.statusButton = button;
    view.idleIcon = [button.image copy];view.idleIcon.size = NSMakeSize(18,18);view.idleIcon.template = NO;
    view.statusTooltip = @"GoPic：拖入文件上传";button.imagePosition = NSImageOnly;
    view.statusMenu = [[NSMenu alloc] initWithTitle:@"GoPic"];view.statusMenu.autoenablesItems = NO;
    NSArray *titles = @[@"最近上传：暂无上传记录",@"打开 GoPic",@"退出 GoPic"];
    for (NSInteger i=0;i<3;i++) {
        if (i>0) [view.statusMenu addItem:NSMenuItem.separatorItem];
        NSMenuItem *entry = [[NSMenuItem alloc] initWithTitle:titles[i] action:@selector(menuAction:) keyEquivalent:i==1 ? @"o" : i==2 ? @"q" : @""];
        entry.target = view;entry.tag = i;entry.enabled = i>0;
        [view.statusMenu addItem:entry];if (i==0) view.latestItem = entry;
    }
    [button addSubview:view];objc_setAssociatedObject(item,@selector(gopicDropView),view,OBJC_ASSOCIATION_RETAIN_NONATOMIC);[view refreshIcon];
}
void gopic_set_status_state(void *rawStatusItem, const char *rawState, const char *rawTooltip) {
    NSStatusItem *item = (__bridge NSStatusItem *)rawStatusItem;
    GoPicDropView *view = objc_getAssociatedObject(item,@selector(gopicDropView));
    view.state = [NSString stringWithUTF8String:rawState];view.statusTooltip = [NSString stringWithUTF8String:rawTooltip];[view refreshIcon];
}

// 最近上传项由 Rust 存储同步，菜单显示 URL 提示，点击只复制链接。
void gopic_set_latest(void *rawStatusItem, const char *name, const char *url) {
    NSStatusItem *item = (__bridge NSStatusItem *)rawStatusItem;
    GoPicDropView *view = objc_getAssociatedObject(item,@selector(gopicDropView));
    view.latestItem.title = [@"最近上传：" stringByAppendingString:[NSString stringWithUTF8String:name]];
    view.latestItem.toolTip = [NSString stringWithUTF8String:url];view.latestItem.enabled = YES;
}
