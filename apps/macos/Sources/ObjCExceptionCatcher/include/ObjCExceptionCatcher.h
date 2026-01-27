#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Safely tries to install a tap on an AVAudioNode, catching any Objective-C exceptions.
/// @param node The audio node to install the tap on.
/// @param bus The bus number to tap.
/// @param bufferSize The size of the audio buffer.
/// @param format The audio format (pass nil to use the node's native format).
/// @param block The block to call with audio buffers.
/// @param outError If non-nil and an exception occurs, contains error info about the exception.
/// @return YES if the tap was installed successfully, NO if an exception was thrown.
BOOL CBTryInstallTap(AVAudioNode *node, AVAudioNodeBus bus, AVAudioFrameCount bufferSize,
                     AVAudioFormat * _Nullable format, AVAudioNodeTapBlock block, NSError * _Nullable * _Nullable outError);

NS_ASSUME_NONNULL_END
