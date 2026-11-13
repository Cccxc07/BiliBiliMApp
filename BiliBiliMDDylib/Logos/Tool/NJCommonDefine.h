//
//  NJCommonDefine.h
//  BiliBiliTweak
//
//  Created by touchWorld on 2025/6/13.
//

#import <UIKit/UIKit.h>
#import "NJAsset.h"
#import "NJCommonDefineForSwift.h"
#import "NJSettingCache.h"
#import "BFCAccountUserModel.h"

NS_ASSUME_NONNULL_BEGIN


/// 设置的缓存
#define NJ_SETTING_CACHE [NJSettingCache sharedInstance].cache
/// 图片资源路径
#define NJ_IMAGE_ASSET_PATH(path) [NJAsset pathForImageAsset:path]
/// 资源路径
#define NJ_ASSET_PATH(path) [NJAsset pathForAsset:path]

/// --------------------- 用户信息 ---------------------
/// BFCUserModel
/// BFCAccountUserModel

@interface BBMallAccountManager : NSObject

@property (readonly, nonatomic) BFCAccountUserModel *userModel;
@property (readonly, copy, nonatomic) NSString *userId;

+ (id)defaultManager;

@end

#define NJ_MID [[[NSClassFromString(@"BBMallAccountManager") defaultManager] userModel] mid]
#define NJ_MID_STR [NSString stringWithFormat:@"%lld", NJ_MID]

#define NJ_UID NJ_MID
#define NJ_UID_STR NJ_MID_STR

/// --------------------- 用户信息 ---------------------



/// --------------------- 设置页面 ---------------------
/// 总开关
#define NJ_MASTER_SWITCH_KEY @"NJ_MASTER_SWITCH_KEY"
/// 总开关的值
#define NJ_MASTER_SWITCH_VALUE (![NJ_SETTING_CACHE containsObjectForKey:NJ_MASTER_SWITCH_KEY] || \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_MASTER_SWITCH_KEY] boolValue])

/// 底部栏-发布(+)
#define NJ_PUBLISH_KEY @"NJ_PUBLISH_KEY"
/// 底部栏-发布(+)的值
#define NJ_PUBLISH_VALUE ([NJ_SETTING_CACHE containsObjectForKey:NJ_PUBLISH_KEY] && \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_PUBLISH_KEY] boolValue])

/// 底部栏-会员购
#define NJ_MALL_KEY @"NJ_MALL_KEY"
/// 底部栏-会员购的值
#define NJ_MALL_VALUE ([NJ_SETTING_CACHE containsObjectForKey:NJ_MALL_KEY] && \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_MALL_KEY] boolValue])

/// 我的-不常用服务
#define NJ_UNUSED_SERVICE_KEY @"NJ_UNUSED_SERVICE_KEY"
/// 我的-不常用服务的值
#define NJ_UNUSED_SERVICE_VALUE ([NJ_SETTING_CACHE containsObjectForKey:NJ_UNUSED_SERVICE_KEY] && \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_UNUSED_SERVICE_KEY] boolValue])

/// 自动领取大会员福利
#define NJ_AUTO_RECEIVE_COUPON_KEY @"NJ_AUTO_RECEIVE_COUPON_KEY"
/// 自动领取大会员福利的值
#define NJ_AUTO_RECEIVE_COUPON_VALUE (![NJ_SETTING_CACHE containsObjectForKey:NJ_AUTO_RECEIVE_COUPON_KEY] || \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_AUTO_RECEIVE_COUPON_KEY] boolValue])

/// 竖屏模式
#define NJ_VERTICAL_SCREEN_MODE_KEY @"NJ_VERTICAL_SCREEN_MODE_KEY"
/// 竖屏模式的值
#define NJ_VERTICAL_SCREEN_MODE_VALUE ([NJ_SETTING_CACHE containsObjectForKey:NJ_VERTICAL_SCREEN_MODE_KEY] && \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_VERTICAL_SCREEN_MODE_KEY] boolValue])

/// 首页搜索框-热词（默认开启=清空热词，关闭后保留B站轮换的热搜词）
#define NJ_HOME_SEARCH_HOT_WORD_KEY @"NJ_HOME_SEARCH_HOT_WORD_KEY"
/// 首页搜索框-热词的值
#define NJ_HOME_SEARCH_HOT_WORD_VALUE (![NJ_SETTING_CACHE containsObjectForKey:NJ_HOME_SEARCH_HOT_WORD_KEY] || \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_HOME_SEARCH_HOT_WORD_KEY] boolValue])

/// 搜索结果-相关搜索（默认开启=去掉相关搜索，广告始终过滤）
#define NJ_SEARCH_RELATED_KEY @"NJ_SEARCH_RELATED_KEY"
/// 搜索结果-相关搜索的值
#define NJ_SEARCH_RELATED_VALUE (![NJ_SETTING_CACHE containsObjectForKey:NJ_SEARCH_RELATED_KEY] || \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_SEARCH_RELATED_KEY] boolValue])

/// 直播间-保留观看人数/醒目留言（默认开启 = 不屏蔽这两类内容；关闭后恢复作者原版的激进屏蔽）
#define NJ_LIVE_KEEP_AUDIENCE_KEY @"NJ_LIVE_KEEP_AUDIENCE_KEY"
/// 直播间-保留观看人数/醒目留言的值
#define NJ_LIVE_KEEP_AUDIENCE_VALUE (![NJ_SETTING_CACHE containsObjectForKey:NJ_LIVE_KEEP_AUDIENCE_KEY] || \
[(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_LIVE_KEEP_AUDIENCE_KEY] boolValue])

/// --------------------- 设置页面 ---------------------

/// --------------------- 单例 ---------------------

// .h头文件中的单例宏
#define NJ_SINGLETON_H(name) \
+ (instancetype)shared##name;

// .m文件中的单例宏
#define NJ_SINGLETON_M(name) \
static id _instance; \
+ (instancetype)allocWithZone:(struct _NSZone *)zone { \
    static dispatch_once_t onceToken; \
    dispatch_once(&onceToken, ^{ \
        _instance = [super allocWithZone:zone]; \
    }); \
    return _instance; \
} \
+ (instancetype)shared##name { \
    static dispatch_once_t onceToken; \
    dispatch_once(&onceToken, ^{ \
        _instance = [[self alloc] init]; \
    }); \
    return _instance; \
} \
- (id)copyWithZone:(NSZone *)zone { \
    return _instance; \
} \
- (id)mutableCopyWithZone:(nullable NSZone *)zone { \
    return _instance; \
} \

/// --------------------- 单例 ---------------------

NS_ASSUME_NONNULL_END
