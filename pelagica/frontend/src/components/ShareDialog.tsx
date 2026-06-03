import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { fetchShareUsers, createShare, type ShareUser } from '@/api/share';
import { toast } from 'sonner';
import { Loader2, Share2, Users } from 'lucide-react';

interface ShareDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mediaId: string;
    mediaName: string;
}

export default function ShareDialog({
    open,
    onOpenChange,
    mediaId,
    mediaName,
}: ShareDialogProps) {
    const { t } = useTranslation('item');
    const [users, setUsers] = useState<ShareUser[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            loadUsers();
            setSelectedUserIds([]);
        }
    }, [open]);

    async function loadUsers() {
        setIsLoadingUsers(true);
        try {
            const list = await fetchShareUsers();
            setUsers(list);
        } catch (error) {
            console.error('Error loading users:', error);
            setUsers([]);
        } finally {
            setIsLoadingUsers(false);
        }
    }

    async function handleShare() {
        if (selectedUserIds.length === 0) {
            toast.error(t('select_at_least_one_user', '请选择至少一个分享目标用户'));
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await createShare(mediaId, selectedUserIds);
            if (res.success) {
                toast.success(res.msg || t('share_success', '分享成功！'));
                onOpenChange(false);
            } else {
                toast.error(res.msg || t('share_failed', '分享失败，请重试'));
            }
        } catch (error) {
            console.error(error);
            toast.error(t('share_error', '分享出错，无法连接分享系统'));
        } finally {
            setIsSubmitting(false);
        }
    }

    const toggleUser = (userId: string) => {
        setSelectedUserIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-background/90 backdrop-blur-md border-border/40 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                        <Share2 className="h-5 w-5 text-primary" />
                        <span>{t('share_video', '分享影片')}</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground mt-1">
                        {t('share_description', '将此影片共享给同一个 Emby 服务器的其他用户。')}
                        <span className="block font-semibold text-foreground mt-1 truncate">
                            《{mediaName}》
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="my-4 max-h-[250px] overflow-y-auto px-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {isLoadingUsers ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            <span className="text-xs text-muted-foreground">
                                {t('loading_users', '正在加载用户列表...')}
                            </span>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                            <Users className="h-10 w-10 text-muted-foreground/45" />
                            <span className="text-sm text-muted-foreground">
                                {t('no_shareable_users', '无可分享的用户或分享服务不可用')}
                            </span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {users.map((user) => {
                                const checked = selectedUserIds.includes(user.Id);
                                return (
                                    <div
                                        key={user.Id}
                                        onClick={() => toggleUser(user.Id)}
                                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                                            checked
                                                ? 'bg-primary/10 border-primary/45 shadow-sm'
                                                : 'hover:bg-accent/40 border-border/20'
                                        }`}
                                    >
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={() => toggleUser(user.Id)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">
                                                {user.Name}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/75">
                                                ID: {user.Id}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="cursor-pointer"
                    >
                        {t('cancel', '取消')}
                    </Button>
                    <Button
                        onClick={handleShare}
                        disabled={isSubmitting || users.length === 0}
                        className="cursor-pointer"
                    >
                        {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {t('confirm_share', '确认分享')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
