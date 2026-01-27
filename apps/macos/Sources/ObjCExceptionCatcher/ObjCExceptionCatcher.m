#import "include/ObjCExceptionCatcher.h"

BOOL CBTryInstallTap(AVAudioNode *node, AVAudioNodeBus bus, AVAudioFrameCount bufferSize,
                     AVAudioFormat * _Nullable format, AVAudioNodeTapBlock block, NSError **outError) {
    @try {
        [node installTapOnBus:bus bufferSize:bufferSize format:format block:block];
        return YES;
    }
    @catch (NSException *exception) {
        if (outError) {
            *outError = [NSError errorWithDomain:@"ObjCExceptionCatcher"
                                            code:1
                                        userInfo:@{
                NSLocalizedDescriptionKey: exception.reason ?: @"Unknown exception",
                @"NSException": exception
            }];
        }
        return NO;
    }
}
