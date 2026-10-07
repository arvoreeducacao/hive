#import <Foundation/Foundation.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <IOSurface/IOSurface.h>
#import <VideoToolbox/VideoToolbox.h>
#import <dlfcn.h>
#import <objc/message.h>
#import <objc/runtime.h>
#import <unistd.h>

static const uint8_t ANNEXB_START[4] = {0, 0, 0, 1};

static void fail(const char *why) {
  fprintf(stderr, "simscreen: %s\n", why);
  exit(2);
}

static NSString *loadFrameworks(void) {
  NSTask *task = [NSTask new];
  task.launchPath = @"/usr/bin/xcode-select";
  task.arguments = @[ @"-p" ];
  NSPipe *pipe = [NSPipe pipe];
  task.standardOutput = pipe;
  task.standardError = [NSPipe pipe];
  @try {
    [task launch];
    [task waitUntilExit];
  } @catch (NSException *e) {
    fail("xcode-select is not available");
  }
  NSString *developer = [[[NSString alloc]
      initWithData:[pipe.fileHandleForReading readDataToEndOfFile]
          encoding:NSUTF8StringEncoding]
      stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (!developer.length) fail("no developer directory — install Xcode");
  if (!dlopen("/Library/Developer/PrivateFrameworks/CoreSimulator.framework/CoreSimulator", RTLD_NOW))
    fail("CoreSimulator.framework would not load");
  NSString *kit = [developer
      stringByAppendingString:@"/Library/PrivateFrameworks/SimulatorKit.framework/SimulatorKit"];
  if (!dlopen(kit.UTF8String, RTLD_NOW)) fail("SimulatorKit.framework would not load");
  return developer;
}

static id findDevice(NSString *developer, NSString *wanted) {
  Class context = NSClassFromString(@"SimServiceContext");
  if (!context) fail("SimServiceContext is missing — the private API moved");
  NSError *err = nil;
  id shared = ((id (*)(id, SEL, id, NSError **))objc_msgSend)(
      context, @selector(sharedServiceContextForDeveloperDir:error:), developer, &err);
  if (!shared) fail("no simulator service context");
  id set = ((id (*)(id, SEL, NSError **))objc_msgSend)(shared, @selector(defaultDeviceSetWithError:), &err);
  if (!set) fail("no default device set");
  for (id one in ((id (*)(id, SEL))objc_msgSend)(set, @selector(devices))) {
    if ([[one valueForKey:@"state"] unsignedLongValue] != 3) continue;
    if (wanted.length) {
      NSString *udid = [[one valueForKey:@"UDID"] UUIDString];
      if ([udid caseInsensitiveCompare:wanted] != NSOrderedSame) continue;
    }
    return one;
  }
  return nil;
}

static id findDisplayPort(id device) {
  id io = ((id (*)(id, SEL))objc_msgSend)(device, @selector(io));
  if (!io) fail("the device has no io client");
  Protocol *renderable = objc_getProtocol("SimDisplayIOSurfaceRenderable");
  if (!renderable) fail("SimDisplayIOSurfaceRenderable is missing — the private API moved");
  for (id port in ((id (*)(id, SEL))objc_msgSend)(io, @selector(ioPorts))) {
    id descriptor = nil;
    @try {
      descriptor = ((id (*)(id, SEL))objc_msgSend)(port, @selector(descriptor));
    } @catch (NSException *e) {
      continue;
    }
    if (!descriptor || ![descriptor conformsToProtocol:renderable]) continue;
    id surface = nil;
    @try {
      surface = ((id (*)(id, SEL))objc_msgSend)(descriptor, @selector(framebufferSurface));
    } @catch (NSException *e) {
      continue;
    }
    if (surface) return descriptor;
  }
  return nil;
}

static void writeBytes(const uint8_t *bytes, size_t length) {
  if (fwrite(bytes, 1, length, stdout) != length) {
    fprintf(stderr, "simscreen: nobody is reading — stopping\n");
    exit(0);
  }
}

static void writeParameterSets(CMFormatDescriptionRef format) {
  size_t count = 0;
  if (CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, 0, NULL, NULL, &count, NULL) != noErr)
    return;
  for (size_t i = 0; i < count; i++) {
    const uint8_t *set = NULL;
    size_t length = 0;
    if (CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, i, &set, &length, NULL, NULL) != noErr)
      continue;
    writeBytes(ANNEXB_START, sizeof(ANNEXB_START));
    writeBytes(set, length);
  }
}

static BOOL isKeyframe(CMSampleBufferRef sample) {
  CFArrayRef attachments = CMSampleBufferGetSampleAttachmentsArray(sample, false);
  if (!attachments || CFArrayGetCount(attachments) == 0) return YES;
  CFDictionaryRef first = CFArrayGetValueAtIndex(attachments, 0);
  return !CFDictionaryContainsKey(first, kCMSampleAttachmentKey_NotSync);
}

static void onEncoded(void *context, void *frame, OSStatus status, VTEncodeInfoFlags flags,
                      CMSampleBufferRef sample) {
  (void)context;
  (void)frame;
  (void)flags;
  if (status != noErr || !sample || !CMSampleBufferDataIsReady(sample)) return;
  if (isKeyframe(sample)) writeParameterSets(CMSampleBufferGetFormatDescription(sample));

  CMBlockBufferRef block = CMSampleBufferGetDataBuffer(sample);
  size_t total = 0;
  char *bytes = NULL;
  if (CMBlockBufferGetDataPointer(block, 0, NULL, &total, &bytes) != noErr) return;
  size_t at = 0;
  while (at + 4 <= total) {
    uint32_t length = 0;
    memcpy(&length, bytes + at, 4);
    length = CFSwapInt32BigToHost(length);
    at += 4;
    if (length == 0 || at + length > total) break;
    writeBytes(ANNEXB_START, sizeof(ANNEXB_START));
    writeBytes((const uint8_t *)bytes + at, length);
    at += length;
  }
  fflush(stdout);
}

static VTCompressionSessionRef makeSession(size_t width, size_t height, double fps, int bitrate) {
  NSDictionary *source = @{
    (__bridge NSString *)kCVPixelBufferPixelFormatTypeKey : @(kCVPixelFormatType_32BGRA),
    (__bridge NSString *)kCVPixelBufferWidthKey : @(width),
    (__bridge NSString *)kCVPixelBufferHeightKey : @(height),
    (__bridge NSString *)kCVPixelBufferIOSurfacePropertiesKey : @{}
  };
  VTCompressionSessionRef session = NULL;
  OSStatus made = VTCompressionSessionCreate(
      kCFAllocatorDefault, (int32_t)width, (int32_t)height, kCMVideoCodecType_H264, NULL,
      (__bridge CFDictionaryRef)source, NULL, onEncoded, NULL, &session);
  if (made != noErr || !session) return NULL;
  VTSessionSetProperty(session, kVTCompressionPropertyKey_RealTime, kCFBooleanTrue);
  VTSessionSetProperty(session, kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse);
  VTSessionSetProperty(session, kVTCompressionPropertyKey_ProfileLevel,
                       kVTProfileLevel_H264_Baseline_AutoLevel);
  VTSessionSetProperty(session, kVTCompressionPropertyKey_AverageBitRate, (__bridge CFNumberRef) @(bitrate));
  VTSessionSetProperty(session, kVTCompressionPropertyKey_ExpectedFrameRate, (__bridge CFNumberRef) @(fps));
  VTSessionSetProperty(session, kVTCompressionPropertyKey_MaxKeyFrameInterval, (__bridge CFNumberRef) @((int)(fps * 2)));
  VTSessionSetProperty(session, kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, (__bridge CFNumberRef) @(2));
  VTCompressionSessionPrepareToEncodeFrames(session);
  return session;
}

int main(int argc, const char **argv) {
  @autoreleasepool {
    NSString *udid = @"";
    double fps = 30;
    int bitrate = 6000000;
    for (int i = 1; i < argc - 1; i++) {
      if (!strcmp(argv[i], "--udid")) udid = @(argv[i + 1]);
      else if (!strcmp(argv[i], "--fps")) fps = atof(argv[i + 1]);
      else if (!strcmp(argv[i], "--bitrate")) bitrate = atoi(argv[i + 1]);
    }
    if (fps < 1 || fps > 60) fps = 30;
    if (bitrate < 200000) bitrate = 6000000;

    NSString *developer = loadFrameworks();
    id device = findDevice(developer, udid);
    if (!device) fail("no booted simulator — boot one first");
    id port = findDisplayPort(device);
    if (!port) fail("no display port handed back a framebuffer");

    IOSurfaceRef first =
        (__bridge IOSurfaceRef)((id (*)(id, SEL))objc_msgSend)(port, @selector(framebufferSurface));
    if (!first) fail("the framebuffer surface disappeared");
    size_t width = IOSurfaceGetWidth(first) & ~(size_t)1;
    size_t height = IOSurfaceGetHeight(first) & ~(size_t)1;
    if (!width || !height) fail("the framebuffer has no size");

    VTCompressionSessionRef session = makeSession(width, height, fps, bitrate);
    if (!session) fail("VideoToolbox would not open an h264 encoder");

    __block int64_t sent = 0;
    __block CFAbsoluteTime last = 0;
    dispatch_queue_t queue = dispatch_queue_create("simscreen.encode", DISPATCH_QUEUE_SERIAL);
    double minGap = 1.0 / fps;

    void (^encode)(void) = ^{
      CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
      if (now - last < minGap) return;
      last = now;
      IOSurfaceRef surface =
          (__bridge IOSurfaceRef)((id (*)(id, SEL))objc_msgSend)(port, @selector(framebufferSurface));
      if (!surface) return;
      CVPixelBufferRef pixels = NULL;
      if (CVPixelBufferCreateWithIOSurface(kCFAllocatorDefault, surface, NULL, &pixels) != kCVReturnSuccess ||
          !pixels)
        return;
      CMTime when = CMTimeMake(sent++ * 1000 / (int64_t)fps, 1000);
      VTCompressionSessionEncodeFrame(session, pixels, when, kCMTimeInvalid, NULL, NULL, NULL);
      CVPixelBufferRelease(pixels);
    };

    NSUUID *token = [NSUUID UUID];
    void (^damaged)(id) = ^(id rectangles) {
      (void)rectangles;
      dispatch_async(queue, encode);
    };
    @try {
      ((void (*)(id, SEL, id, id))objc_msgSend)(
          port, @selector(registerCallbackWithUUID:damageRectanglesCallback:), token, damaged);
    } @catch (NSException *e) {
      fail("the damage callback would not register");
    }

    dispatch_async(queue, encode);
    dispatch_source_t tick = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, queue);
    dispatch_source_set_timer(tick, dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), NSEC_PER_SEC, 0);
    dispatch_source_set_event_handler(tick, ^{
      if (getppid() == 1) {
        fprintf(stderr, "simscreen: the hive that started us is gone\n");
        exit(0);
      }
      if ([[device valueForKey:@"state"] unsignedLongValue] != 3) {
        fprintf(stderr, "simscreen: the simulator is no longer booted\n");
        exit(3);
      }
      encode();
    });
    dispatch_resume(tick);

    dispatch_source_t broken = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, SIGPIPE, 0, queue);
    dispatch_source_set_event_handler(broken, ^{ exit(0); });
    dispatch_resume(broken);
    signal(SIGPIPE, SIG_IGN);

    [[NSRunLoop currentRunLoop] run];
  }
  return 0;
}
