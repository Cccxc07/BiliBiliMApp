// 主页-直播详情页广告

#import <UIKit/UIKit.h>
#import "NJCommonDefine.h"

%group App

// 收入面板，包含礼物面板
%hook BBLiveRevenueCardsContentView

- (id)initWithDataSource:(id)source viewModel:(id)model {
    return nil;
}

%end

// 预约
// 预约按钮
%hook BBLiveBaseAppointmentEntryView

- (id)initWithFrame:(CGRect)frame {
    return nil;
}

%end

// 预约弹窗
@interface BBLiveBaseAppointmentCardView : NSObject

@end

%hook BBLiveBaseAppointmentCardView

- (id)initWithEntryFrame:(CGRect)frame {
    return nil;
}

%end

// 全屏topBar
@interface BBLivePoliticalFullScreenTopBar : UIView

// 用户排名列表
@property (retain, nonatomic) UIView *userRankListEntryView;

@end

%hook BBLivePoliticalFullScreenTopBar

- (void)layoutSubviews {
    %orig;
    // 保留观看人数/人气：不摘除用户排名列表入口
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return;
    }
    // 用户排名列表
    [self.userRankListEntryView removeFromSuperview];
    self.userRankListEntryView = nil;
}

- (void)_updateUserRankListEntryViewIfNeed {
    // 保留观看人数/人气：走原实现
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        %orig;
    }
}

%end

// 竖屏topBar
@interface BBLiveVerticalTopBar : UIView

// 用户排名列表
@property (retain, nonatomic) UIView *userRankListEntryView;

@end

%hook BBLiveVerticalTopBar

- (void)layoutSubviews {
    %orig;
    // 保留观看人数/人气：不摘除用户排名列表入口
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return;
    }
    // 用户排名列表
    [self.userRankListEntryView removeFromSuperview];
    self.userRankListEntryView = nil;
}

- (void)_updateUserRankListEntryViewIfNeed {
    // 保留观看人数/人气：走原实现
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        %orig;
    }
}

%end

// 人气榜（观看人数就挂在这里；受「直播间-保留观看人数/醒目留言」开关控制，默认保留）
%hook BBLiveBasePopularHotRankEntryView

- (id)initWithFrame:(CGRect)frame {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

%end


// 人气榜（观看人数就挂在这里；受「直播间-保留观看人数/醒目留言」开关控制，默认保留）
%hook BBLiveBasePopularRankEntryView

- (id)initWithFrame:(CGRect)frame {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

%end

%hook BBLiveVerticalPanelViewController

- (id)popularRankEntryViews {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

%end

// 分区排行，比如娱乐新人
%hook BBLiveBaseAreaRankEntryView

- (id)initWithFrame:(CGRect)frame {
    return nil;
}

%end

%hook BBLiveBaseMixedRankEntryView

- (id)initWithFrame:(CGRect)frame {
    return nil;
}

%end

// 右上角入口，比如观赛活动、更多直播入口
%hook BBLiveTopRightEntranceManager

- (id)init {
    return nil;
}

%end

// 右下角活动，比如LOL投稿有奖
%hook BBLiveChainView

- (id)initWithFrame:(CGRect)frame {
    return nil;
}


%end

// 弹幕下面的功能卡，比如游戏赛程卡（醒目留言卡片同属该管理器，默认保留）
%hook BBLiveFunctionCardTaskManager

- (id)init {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

%end

// 弹幕下面的购物说明卡，比如热门抢购卡
%hook BBLiveShoppingExplainCardViewModel

- (id)initWithDataSource:(id)source tracker:(id)tracker {
    return nil;
}

%end

//  顶部吊坠，比如LOL观赛福利入口、红包、心愿单
@interface BBLiveVerticalCenterBar : NSObject

@property (retain, nonatomic) UIView *topPendantContainerView;

@end

%hook BBLiveVerticalCenterBar

// 顶部吊坠
- (void)layoutTopPendantContainerView {
    [self.topPendantContainerView removeFromSuperview];
    self.topPendantContainerView = nil;
}

// 弹幕下面的购物推荐卡
- (void)_showShoppingRecommendViewWithInfo:(id)info completion:(id)completion {
}

%end


// 礼物动画
// BBLiveBaseMP4AnimationView
// BBLiveBaseSpineAnimationView
// BBLiveBaseSVGAAnimationView
%hook BBLiveBaseAnimationView

- (id)initWithFrame:(CGRect)frame {
    return nil;
}

%end

// 关注弹窗
%hook BBLiveFollowCardAlertComponent

- (id)initWithDataSource:(id)source {
    return nil;
}

%end

%hook BBLiveFullScreenFloatPanelView

// 修复8.76.0奔溃
- (void)registerComponent:(id)component {
    if (!component) {
        return;
    }
    %orig;
}

%end

// 热门榜、人气榜容器（受「直播间-保留观看人数/醒目留言」开关控制，默认保留）
%hook LynxView

- (id)initWithCoder:(id)coder {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

- (id)init {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

- (id)initWithFrame:(CGRect)frame {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

- (id)initWithBuilderBlock:(id)block {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

- (id)initWithoutRender {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

%end

// 直播详情-弹幕底部的功能卡（醒目留言最可能落在这里，默认保留）
%hook BBLChronFunctionCard

- (id)initWithStore:(id)store {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

- (id)init {
    if (NJ_LIVE_KEEP_AUDIENCE_VALUE) {
        return %orig;
    }
    return nil;
}

%end

%end

%ctor {
    if (NJ_MASTER_SWITCH_VALUE) {
        %init(App);
    }
}


